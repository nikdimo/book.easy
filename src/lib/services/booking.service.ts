import { db } from "@/lib/db";
import { BookingStatus, BlockType } from "@prisma/client";
import { differenceInDays } from "date-fns";
import { buildPriceOverrideMap, computeStayPricing } from "@/lib/utils/stay-pricing";
import { isAvailabilityOverlapConstraintError } from "@/lib/utils/db-errors";

/** Fire a notification without letting failures — including a failed dynamic import of
 * the email module — propagate to the caller. A successfully committed booking
 * mutation must never appear to fail just because the email step had a problem. */
function notifyBestEffort(fn: () => Promise<void>): void {
  fn().catch(() => {
    /* non-blocking */
  });
}

/**
 * Lazily transitions confirmed bookings whose stay has ended to COMPLETED. There's no
 * background job in this deployment, so callers that read booking lists/details call
 * this first — it's a single indexed, idempotent UPDATE that touches ~0 rows on most
 * calls. Phase 2 (reviews) depends on this status actually being reachable.
 */
export async function completePastBookings(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await db.booking.updateMany({
    where: {
      status: BookingStatus.CONFIRMED,
      checkOut: { lt: today },
    },
    data: { status: BookingStatus.COMPLETED },
  });
}

interface CreateBookingInput {
  listingId: string;
  guestId: string;
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  guestNote?: string;
}

export async function createBooking(input: CreateBookingInput) {
  const { listingId, guestId, checkIn, checkOut, guestCount, guestNote } = input;

  let booking;
  try {
    booking = await db.$transaction(async (tx) => {
      // 0. Serialize all writers (bookings + manual blocks) for this listing so two
      // concurrent requests for overlapping dates can't both pass the overlap check
      // below before either insert is visible (the transaction's default READ COMMITTED
      // isolation does not prevent that on its own). Lock is released at commit/rollback.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;

      // 1. Verify listing exists and is approved
      const listing = await tx.listing.findFirst({
        where: { id: listingId, status: "APPROVED" },
        include: { pricingRule: true },
      });

      if (!listing) {
        throw new Error("Listing not found or not available");
      }

      if (!listing.pricingRule) {
        throw new Error("Listing pricing not configured");
      }

      // 2. Validate guest count
      if (guestCount > listing.maxGuests) {
        throw new Error(`Maximum ${listing.maxGuests} guests allowed`);
      }

      // 3. Validate minimum nights
      const numberOfNights = differenceInDays(checkOut, checkIn);
      if (numberOfNights < listing.pricingRule.minNights) {
        throw new Error(`Minimum stay is ${listing.pricingRule.minNights} nights`);
      }

      if (listing.pricingRule.maxNights && numberOfNights > listing.pricingRule.maxNights) {
        throw new Error(`Maximum stay is ${listing.pricingRule.maxNights} nights`);
      }

      // 4. Check for overlapping availability blocks (atomic within transaction)
      const overlapping = await tx.availabilityBlock.findFirst({
        where: {
          listingId,
          startDate: { lt: checkOut },
          endDate: { gt: checkIn },
        },
      });

      if (overlapping) {
        throw new Error("These dates are no longer available. Please select different dates.");
      }

      // 5. Calculate pricing (per-night overrides when set)
      const baseNightly = Number(listing.pricingRule.baseNightlyRate);
      const overrideRows = await tx.listingDatePrice.findMany({
        where: {
          listingId,
          date: { gte: checkIn, lt: checkOut },
        },
      });
      const overrideMap = buildPriceOverrideMap(overrideRows);
      const { subtotal, averageNightly } = computeStayPricing(
        baseNightly,
        checkIn,
        checkOut,
        overrideMap
      );
      const nightlyRate = averageNightly;
      const cleaningFee = listing.pricingRule.cleaningFee;
      const serviceFee = 0; // Placeholder for future platform fee
      const totalPrice = subtotal + Number(cleaningFee) + Number(serviceFee);

      // 6. Create booking
      const created = await tx.booking.create({
        data: {
          listingId,
          guestId,
          checkIn,
          checkOut,
          guestCount,
          nightlyRate,
          cleaningFee,
          serviceFee,
          totalPrice,
          numberOfNights,
          status: BookingStatus.PENDING,
          guestNote,
        },
      });

      // 7. Create availability hold
      await tx.availabilityBlock.create({
        data: {
          listingId,
          startDate: checkIn,
          endDate: checkOut,
          blockType: BlockType.BOOKING_HOLD,
          bookingId: created.id,
        },
      });

      return created;
    });
  } catch (error) {
    // Backstop: the advisory lock above prevents this under normal operation, but if
    // it's ever bypassed, the DB-level exclusion constraint (see
    // prisma/migrations/20260710175030_availability_block_no_overlap) still rejects the
    // overlap — translate it to the same friendly message instead of a raw 500.
    if (isAvailabilityOverlapConstraintError(error)) {
      throw new Error("These dates are no longer available. Please select different dates.");
    }
    throw error;
  }

  notifyBestEffort(async () => {
    const { notifyHostNewBookingRequest } = await import("@/lib/email");
    await notifyHostNewBookingRequest(booking.id);
  });
  return booking;
}

export async function cancelBooking(
  bookingId: string,
  userId: string,
  cancelledBy: "guest" | "host" | "admin",
  reason?: string
) {
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });

    if (!booking) throw new Error("Booking not found");

    if (cancelledBy === "guest" && booking.guestId !== userId) {
      throw new Error("You can only cancel your own bookings");
    }

    if (cancelledBy === "host" && booking.listing.hostId !== userId) {
      throw new Error("You can only cancel bookings for your own listings");
    }

    if (
      booking.status !== BookingStatus.PENDING &&
      booking.status !== BookingStatus.CONFIRMED
    ) {
      throw new Error("This booking cannot be cancelled");
    }

    const statusMap = {
      guest: BookingStatus.CANCELLED_BY_GUEST,
      host: BookingStatus.CANCELLED_BY_HOST,
      admin: BookingStatus.CANCELLED_BY_ADMIN,
    };

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: statusMap[cancelledBy],
        cancellationReason: reason,
      },
    });

    // Release availability hold
    await tx.availabilityBlock.deleteMany({
      where: {
        bookingId: bookingId,
        blockType: BlockType.BOOKING_HOLD,
      },
    });

    return updated;
  }).then((updated) => {
    notifyBestEffort(async () => {
      const {
        notifyGuestBookingCancelled,
        notifyHostBookingCancelledByGuest,
      } = await import("@/lib/email");
      if (cancelledBy === "guest") {
        await notifyHostBookingCancelledByGuest(updated.id);
      } else {
        await notifyGuestBookingCancelled(updated.id);
      }
    });
    return updated;
  });
}

export async function confirmBooking(bookingId: string, hostId: string) {
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });

    if (!booking) throw new Error("Booking not found");
    if (booking.listing.hostId !== hostId) {
      throw new Error("You can only confirm bookings for your own listings");
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new Error("Only pending bookings can be confirmed");
    }

    return tx.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CONFIRMED },
    });
  }).then((booking) => {
    notifyBestEffort(async () => {
      const { notifyGuestBookingConfirmed } = await import("@/lib/email");
      await notifyGuestBookingConfirmed(booking.id);
    });
    return booking;
  });
}

export async function rejectBooking(bookingId: string, hostId: string, reason?: string) {
  return db.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });

    if (!booking) throw new Error("Booking not found");
    if (booking.listing.hostId !== hostId) {
      throw new Error("You can only reject bookings for your own listings");
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new Error("Only pending bookings can be rejected");
    }

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.REJECTED,
        cancellationReason: reason,
      },
    });

    await tx.availabilityBlock.deleteMany({
      where: { bookingId, blockType: BlockType.BOOKING_HOLD },
    });

    return updated;
  }).then((updated) => {
    notifyBestEffort(async () => {
      const { notifyGuestBookingRejected } = await import("@/lib/email");
      await notifyGuestBookingRejected(updated.id);
    });
    return updated;
  });
}

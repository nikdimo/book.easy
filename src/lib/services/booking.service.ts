import { db } from "@/lib/db";
import { BookingStatus, BlockType } from "@prisma/client";
import { differenceInDays } from "date-fns";
import { buildPriceOverrideMap, computeStayPricing } from "@/lib/utils/stay-pricing";

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

  return db.$transaction(async (tx) => {
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
    const booking = await tx.booking.create({
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
        bookingId: booking.id,
      },
    });

    return booking;
  }).then(async (booking) => {
    const { notifyHostNewBookingRequest } = await import("@/lib/email");
    void notifyHostNewBookingRequest(booking.id).catch(() => {
      /* non-blocking */
    });
    return booking;
  });
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
  });
}

import "server-only";
import { db } from "@/lib/db";
import {
  BookingEmailKind,
  BookingStatus,
  BlockType,
  type Prisma,
} from "@prisma/client";
import { differenceInDays } from "date-fns";
import {
  buildPriceOverrideMap,
  computeStayQuote,
} from "@/lib/utils/stay-pricing";
import { isAvailabilityOverlapConstraintError } from "@/lib/utils/db-errors";
import {
  conversionRate,
  type ConversionContext,
} from "@/lib/currency/convert";
import { newBookingReference } from "@/lib/utils/booking-reference";
import {
  enqueueBookingEmails,
  kickBookingEmailDelivery,
} from "@/lib/services/booking-email-outbox.service";
import { houseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";
import { houseRulesVersion } from "@/lib/host/v2/house-rules-version.server";
import {
  isPaymentMethodCode,
  parsePaymentMethodsSnapshot,
  paymentMethodsSnapshot,
  type PaymentMethodCode,
} from "@/lib/payments/payment-methods";
import {
  parsePaymentInstructionTemplates,
  paymentInstructionTemplatesSnapshot,
  validatePaymentInstructionTemplates,
} from "@/lib/payments/payment-instruction-templates";
import {
  calculateDepositAmounts,
  createDepositPoliciesSnapshot,
  parseDepositPoliciesSnapshot,
} from "@/lib/payments/deposit-policies";

export const BOOKING_RESPONSE_WINDOW_HOURS = 24;

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
  const completing = await db.booking.findMany({
    where: {
      status: BookingStatus.CONFIRMED,
      checkOut: { lte: today },
    },
    select: { id: true },
  });
  if (completing.length === 0) return;

  await db.booking.updateMany({
    where: { id: { in: completing.map((booking) => booking.id) } },
    data: { status: BookingStatus.COMPLETED },
  });
  await db.bookingTimelineEvent.createMany({
    data: completing.map((booking) => ({
      bookingId: booking.id,
      type: "COMPLETED",
      idempotencyKey: `booking:${booking.id}:completed`,
      createdAt: today,
    })),
    skipDuplicates: true,
  });

  // Completing the stay also opens the sealed 14-day review window. Invitations are
  // independently deduplicated, so a retry cannot send duplicate opening messages.
  const { ensureReviewInvitationsForBooking } =
    await import("@/lib/services/review.service");
  await Promise.allSettled(
    completing.map((booking) => ensureReviewInvitationsForBooking(booking.id)),
  );
}

export async function expirePendingBookings(now = new Date()): Promise<number> {
  const due = await db.booking.findMany({
    where: {
      status: BookingStatus.PENDING,
      responseDueAt: { lte: now },
    },
    select: { id: true },
  });
  if (due.length === 0) return 0;

  const expiredIds = await db.$transaction(async (tx) => {
    const expired: string[] = [];
    for (const booking of due) {
      const result = await tx.booking.updateMany({
        where: {
          id: booking.id,
          status: BookingStatus.PENDING,
          responseDueAt: { lte: now },
        },
        data: {
          status: BookingStatus.EXPIRED,
          respondedAt: now,
        },
      });
      if (result.count === 0) continue;
      expired.push(booking.id);
      await tx.availabilityBlock.deleteMany({
        where: {
          bookingId: booking.id,
          blockType: BlockType.BOOKING_HOLD,
        },
      });
      await enqueueBookingEmails(tx, booking.id, [
        BookingEmailKind.GUEST_EXPIRED,
      ]);
    }
    return expired;
  });

  for (const bookingId of expiredIds) kickBookingEmailDelivery(bookingId);
  await Promise.allSettled(
    expiredIds.map((bookingId) =>
      import("@/lib/services/notification.service").then(
        ({ notifyBookingEvent }) => notifyBookingEvent(bookingId, "expired"),
      ),
    ),
  );
  return expiredIds.length;
}

export async function sendDueBookingRequestReminders(
  now = new Date(),
): Promise<number> {
  const reminderThreshold = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const due = await db.booking.findMany({
    where: {
      status: BookingStatus.PENDING,
      hostReminderSentAt: null,
      responseDueAt: {
        gt: now,
        lte: reminderThreshold,
      },
    },
    select: { id: true },
  });
  if (due.length === 0) return 0;

  const queued = await db.$transaction(async (tx) => {
    let count = 0;
    for (const booking of due) {
      const stillDue = await tx.booking.count({
        where: {
          id: booking.id,
          status: BookingStatus.PENDING,
          hostReminderSentAt: null,
          responseDueAt: { gt: now, lte: reminderThreshold },
        },
      });
      if (!stillDue) continue;
      count += await enqueueBookingEmails(tx, booking.id, [
        BookingEmailKind.HOST_REQUEST_REMINDER,
      ]);
    }
    return count;
  });
  for (const booking of due) kickBookingEmailDelivery(booking.id);
  return queued;
}

export async function getGuestBookings(guestId: string) {
  await expirePendingBookings();
  await completePastBookings();
  return db.booking.findMany({
    where: { guestId },
    include: {
      listing: {
        include: {
          property: true,
          images: { where: { isPrimary: true }, take: 1 },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getGuestBookingWithHost(
  bookingId: string,
  guestId: string,
) {
  await expirePendingBookings();
  await completePastBookings();
  return db.booking.findFirst({
    where: { id: bookingId, guestId },
    include: {
      listing: {
        include: {
          property: true,
          host: { include: { profile: true } },
          images: {
            where: { isPrimary: true },
            orderBy: { displayOrder: "asc" },
            take: 1,
          },
        },
      },
    },
  });
}

export async function getGuestBookingForConfirmation(
  bookingId: string,
  guestId: string,
) {
  await expirePendingBookings();
  return db.booking.findFirst({
    where: { id: bookingId, guestId },
    include: {
      listing: {
        include: {
          property: true,
          images: { where: { isPrimary: true }, take: 1 },
        },
      },
    },
  });
}

interface CreateBookingInput {
  listingId: string;
  guestId: string;
  checkIn: Date;
  checkOut: Date;
  guestCount: number;
  guestNote?: string;
  /** The guest's choice from the listing methods loaded in the booking transaction. */
  selectedPaymentMethod?: PaymentMethodCode | null;
  /** Guest language at request time. Notifications and confirmation use this frozen
   * value even if the account or browser preference changes later. */
  guestLocale?: string | null;
  /**
   * What the guest was browsing in, and the rate they were shown it at. Recorded
   * only — every amount this function computes and stores is in the listing's
   * official currency, and nothing here participates in that arithmetic.
   *
   * Frozen at this moment on purpose: rates move, and re-converting later would
   * change the figure on a confirmation page and in an already-sent email. The rate
   * is derived here rather than by the caller, because only this function knows the
   * listing's official currency once it has loaded it.
   */
  display?: ConversionContext | null;
  /**
   * When the guest accepted the listing's house rules, or null for a caller that does
   * not collect an acceptance.
   *
   * Only the *moment* comes from the caller. The rules themselves are read from the
   * listing row this function loads inside its own transaction, never from anything the
   * request carried: a snapshot the client could choose would record what the guest
   * wanted to agree to rather than what the listing said.
   */
  houseRulesAcceptedAt?: Date | null;
  /** Fingerprint of the rules the guest actually saw. Required whenever acceptance is
   * recorded and compared with the current listing inside the booking transaction. */
  expectedHouseRulesVersion?: string | null;
}

export async function createBooking(input: CreateBookingInput) {
  const {
    listingId,
    guestId,
    checkIn,
    checkOut,
    guestCount,
    guestNote,
    selectedPaymentMethod,
    guestLocale,
    display,
    houseRulesAcceptedAt,
    expectedHouseRulesVersion,
  } = input;

  const createdAt = new Date();
  const responseDueAt = new Date(
    createdAt.getTime() + BOOKING_RESPONSE_WINDOW_HOURS * 60 * 60 * 1000,
  );
  const reference = newBookingReference(createdAt);
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
        include: {
          pricingRule: true,
          promotions: {
            where: { disabledAt: null },
            orderBy: { createdAt: "desc" },
          },
          availabilityWindows: {
            where: {
              startDate: { lte: checkIn },
              endDate: { gte: checkOut },
            },
            select: { id: true },
          },
        },
      });

      if (!listing) {
        throw new Error("Listing not found or not available");
      }

      if (!listing.pricingRule) {
        throw new Error("Listing pricing not configured");
      }

      const currentHouseRules = houseRulesSnapshot(listing);
      const currentPaymentMethods = paymentMethodsSnapshot(listing);
      let frozenSelectedPaymentMethod: PaymentMethodCode | null = null;
      if (currentPaymentMethods.status === "REVIEWED") {
        if (currentPaymentMethods.methods.length === 1) {
          frozenSelectedPaymentMethod =
            selectedPaymentMethod ?? currentPaymentMethods.methods[0];
        } else {
          frozenSelectedPaymentMethod = selectedPaymentMethod ?? null;
        }
        if (!frozenSelectedPaymentMethod) {
          throw new Error(
            "Choose a payment method accepted by the host before sending your request.",
          );
        }
        if (!currentPaymentMethods.methods.includes(frozenSelectedPaymentMethod)) {
          throw new Error(
            "The host's accepted payment methods changed. Reload the page and choose again.",
          );
        }
      } else if (selectedPaymentMethod) {
        throw new Error(
          "The host's accepted payment methods changed. Reload the page and choose again.",
        );
      }
      const currentDepositPolicies = createDepositPoliciesSnapshot(listing);
      if (houseRulesAcceptedAt) {
        if (
          !expectedHouseRulesVersion ||
          expectedHouseRulesVersion !== houseRulesVersion(currentHouseRules)
        ) {
          throw new Error(
            "The house rules changed while you were booking. Reload the page, review them, and try again.",
          );
        }
      }

      if (
        listing.availabilityMode === "CLOSED" &&
        listing.availabilityWindows.length === 0
      ) {
        throw new Error(
          "These dates are not open for booking. Please select different dates.",
        );
      }

      // 2. Validate guest count
      if (guestCount > listing.maxGuests) {
        throw new Error(`Maximum ${listing.maxGuests} guests allowed`);
      }

      // 3. Validate minimum nights
      const numberOfNights = differenceInDays(checkOut, checkIn);
      if (numberOfNights < listing.pricingRule.minNights) {
        throw new Error(
          `Minimum stay is ${listing.pricingRule.minNights} nights`,
        );
      }

      if (
        listing.pricingRule.maxNights &&
        numberOfNights > listing.pricingRule.maxNights
      ) {
        throw new Error(
          `Maximum stay is ${listing.pricingRule.maxNights} nights`,
        );
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
        throw new Error(
          "These dates are no longer available. Please select different dates.",
        );
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
      const quote = computeStayQuote({
        baseNightly,
        cleaningFee: Number(listing.pricingRule.cleaningFee),
        checkIn,
        checkOut,
        overrides: overrideMap,
        promotions: listing.promotions.map((promotion) => ({
          id: promotion.id,
          type: promotion.type,
          discountPercent: promotion.discountPercent,
          minimumNights: promotion.minimumNights,
          freeCleaning: promotion.freeCleaning,
          roundToWholeUnit: promotion.roundToWholeUnit,
          startDate: promotion.startDate,
          endDate: promotion.endDate,
          createdAt: promotion.createdAt,
        })),
      });
      const nightlyRate = quote.effectiveAverageNightly;
      const cleaningFee = quote.cleaningFee;
      const serviceFee = 0; // Placeholder for future platform fee
      const totalPrice = quote.total + Number(serviceFee);
      // Two amounts, each resolved on its own against the same booking total and never
      // added together: the advance payment is a part of `totalPrice`, while the damage
      // deposit is separate security money the host expects to give back.
      const { advancePaymentAmount, damageDepositAmount } =
        currentDepositPolicies.status === "REVIEWED"
          ? calculateDepositAmounts(currentDepositPolicies, String(totalPrice))
          : { advancePaymentAmount: null, damageDepositAmount: null };
      const appliedPromotion = quote.appliedPromotion;
      const serializedPromotion = (promotion: NonNullable<typeof appliedPromotion>) => ({
        id: promotion.id,
        type: promotion.type,
        discountPercent: promotion.discountPercent ?? null,
        minimumNights: promotion.minimumNights ?? null,
        freeCleaning: promotion.freeCleaning ?? false,
        roundToWholeUnit: promotion.roundToWholeUnit ?? false,
        startDate: promotion.startDate
          ? new Date(promotion.startDate).toISOString()
          : null,
        endDate: promotion.endDate
          ? new Date(promotion.endDate).toISOString()
          : null,
      });
      const priceBreakdown = {
        version: 2,
        currency: listing.pricingRule.currency,
        nights: quote.nightlyBreakdown.map((night) => ({
          ...night,
          source: overrideMap.has(night.date) ? "DATE_OVERRIDE" : "BASE_RATE",
        })),
        originalAccommodationSubtotal: quote.originalAccommodationSubtotal,
        accommodationDiscount: quote.accommodationDiscount,
        accommodationSubtotal: quote.accommodationSubtotal,
        originalCleaningFee: quote.originalCleaningFee,
        cleaningDiscount: quote.cleaningDiscount,
        cleaningFee: quote.cleaningFee,
        originalTotal: quote.originalTotal,
        totalSavings: quote.discountAmount,
        finalTotal: totalPrice,
        appliedPromotion: appliedPromotion
          ? serializedPromotion(appliedPromotion)
          : null,
        appliedPromotions: quote.appliedPromotions.map(serializedPromotion),
      } satisfies Prisma.InputJsonObject;

      // Computed only after the official currency is known, and applied to nothing
      // above: every figure in `priceBreakdown` and every column below stays in the
      // listing's own currency.
      const displayRate = display
        ? conversionRate(listing.pricingRule.currency, display)
        : null;

      // 6. Create booking
      const created = await tx.booking.create({
        data: {
          reference,
          listingId,
          guestId,
          guestLocale: guestLocale ?? null,
          checkIn,
          checkOut,
          guestCount,
          currency: listing.pricingRule.currency,
          nightlyRate,
          cleaningFee,
          serviceFee,
          totalPrice,
          originalTotal: quote.originalTotal,
          discountAmount: quote.discountAmount,
          promotionId: appliedPromotion?.id ?? null,
          promotionType: appliedPromotion?.type ?? null,
          priceBreakdown,
          priceBreakdownVersion: 2,
          // A snapshot of what the guest saw, never a second source of truth for
          // what they owe. `totalPrice` above remains the payable amount. Null all
          // round when the guest was already browsing in the official currency.
          ...(displayRate === null
            ? {}
            : {
                displayCurrency: display!.display,
                displayRate,
                displayTotal: totalPrice * displayRate,
              }),
          numberOfNights,
          status: BookingStatus.PENDING,
          responseDueAt,
          guestNote,
          // Frozen here and never written again. `confirmBooking`, `cancelBooking` and
          // every host edit to the listing leave this row alone, so what this guest
          // agreed to stays readable exactly as it stood — a host who changes their
          // rules tomorrow changes them for the next guest, not for this one.
          //
          // Null all round for a caller that collected no acceptance, which is also what
          // every booking taken before this existed holds. That is a real distinction:
          // "no record" is not "agreed to nothing".
          ...(houseRulesAcceptedAt
            ? {
                // Cast because a Prisma JSON column takes an index-signature type and
                // the snapshot is a named interface — the shape written is exactly
                // `HouseRulesSnapshot`, which `parseHouseRulesSnapshot` reads back.
                houseRulesSnapshot:
                  currentHouseRules as unknown as Prisma.InputJsonObject,
                houseRulesAcceptedAt,
              }
            : {}),
          // Every new request gets the listing's current answer, including the explicit
          // UNANSWERED state. The client cannot supply or override this object; it is
          // built above from the listing row read inside this transaction. Historical
          // bookings remain NULL because the additive migration performs no backfill.
          paymentMethodsSnapshot:
            currentPaymentMethods as unknown as Prisma.InputJsonObject,
          selectedPaymentMethod: frozenSelectedPaymentMethod,
          // Like the method/rule snapshots above, deposit terms come only from the
          // listing row read inside this transaction. The client can neither choose
          // the terms nor submit an amount. Linger Homes records the host's policy;
          // it does not collect or hold this money.
          //
          // Frozen as V2, which carries both policies independently. Bookings frozen
          // before the split keep their V1 object and are read through the same parser.
          depositPolicySnapshot:
            currentDepositPolicies as unknown as Prisma.InputJsonObject,
          advancePaymentAmount,
          damageDepositAmount,
          // Each track opens only if its own policy asked for something. "Not required"
          // is a settled answer, distinct from a track nobody has started yet.
          advancePaymentStatus:
            advancePaymentAmount !== null && Number(advancePaymentAmount) > 0
              ? "UNTRACKED"
              : "NOT_REQUIRED",
          damageDepositStatus:
            damageDepositAmount !== null && Number(damageDepositAmount) > 0
              ? "UNTRACKED"
              : "NOT_REQUIRED",
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
      await enqueueBookingEmails(tx, created.id, [
        BookingEmailKind.GUEST_REQUEST_RECEIVED,
        BookingEmailKind.HOST_NEW_REQUEST,
      ]);

      return created;
    });
  } catch (error) {
    // Backstop: the advisory lock above prevents this under normal operation, but if
    // it's ever bypassed, the DB-level exclusion constraint (see
    // prisma/migrations/20260710175030_availability_block_no_overlap) still rejects the
    // overlap — translate it to the same friendly message instead of a raw 500.
    if (isAvailabilityOverlapConstraintError(error)) {
      throw new Error(
        "These dates are no longer available. Please select different dates.",
      );
    }
    throw error;
  }

  kickBookingEmailDelivery(booking.id);
  notifyBestEffort(async () => {
    const { ensureBookingConversation } =
      await import("@/lib/services/chat.service");
    await ensureBookingConversation(booking.id);
  });
  notifyBestEffort(async () => {
    const { notifyBookingEvent } =
      await import("@/lib/services/notification.service");
    await notifyBookingEvent(booking.id, "request");
  });
  return booking;
}

export async function getHostBookingWithGuest(
  bookingId: string,
  hostId: string,
) {
  await expirePendingBookings();
  await completePastBookings();
  return db.booking.findFirst({
    where: { id: bookingId, listing: { hostId } },
    include: {
      guest: { select: { id: true, name: true, image: true } },
      listing: {
        include: {
          property: true,
          images: {
            where: { isPrimary: true },
            orderBy: { displayOrder: "asc" },
            take: 1,
          },
        },
      },
    },
  });
}

export async function cancelBooking(
  bookingId: string,
  userId: string,
  cancelledBy: "guest" | "host" | "admin",
  reason?: string,
) {
  return db
    .$transaction(async (tx) => {
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

      const cancelled = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: booking.status,
        },
        data: {
          status: statusMap[cancelledBy],
          respondedAt:
            booking.status === BookingStatus.PENDING
              ? new Date()
              : booking.respondedAt,
          cancellationReason: reason,
        },
      });
      if (cancelled.count === 0) {
        throw new Error("This booking changed while it was being cancelled");
      }

      // Release availability hold
      await tx.availabilityBlock.deleteMany({
        where: {
          bookingId: bookingId,
          blockType: BlockType.BOOKING_HOLD,
        },
      });
      await enqueueBookingEmails(tx, bookingId, [
        cancelledBy === "guest"
          ? BookingEmailKind.HOST_CANCELLED_BY_GUEST
          : BookingEmailKind.GUEST_CANCELLED,
      ]);

      return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    })
    .then((updated) => {
      kickBookingEmailDelivery(updated.id);
      notifyBestEffort(async () => {
        const { notifyBookingEvent } =
          await import("@/lib/services/notification.service");
        await notifyBookingEvent(
          updated.id,
          cancelledBy === "guest" ? "cancelled-by-guest" : "cancelled-by-host",
        );
      });
      return updated;
    });
}

export async function getBookingAcceptancePaymentData(
  bookingId: string,
  hostId: string,
) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, listing: { hostId } },
    select: {
      id: true,
      status: true,
      reference: true,
      currency: true,
      totalPrice: true,
      checkIn: true,
      selectedPaymentMethod: true,
      paymentMethodsSnapshot: true,
      guest: { select: { name: true } },
      listing: {
        select: {
          id: true,
          paymentInstructionTemplates: true,
        },
      },
    },
  });
  if (!booking) throw new Error("Booking not found");
  const snapshot = parsePaymentMethodsSnapshot(booking.paymentMethodsSnapshot);
  const selectedPaymentMethod = isPaymentMethodCode(booking.selectedPaymentMethod)
    ? booking.selectedPaymentMethod
    : snapshot?.status === "REVIEWED" && snapshot.methods.length === 1
      ? snapshot.methods[0]
      : null;
  const templates = parsePaymentInstructionTemplates(
    booking.listing.paymentInstructionTemplates,
  );

  return {
    bookingId: booking.id,
    status: booking.status,
    listingId: booking.listing.id,
    reference: booking.reference,
    guestName: booking.guest.name,
    currency: booking.currency,
    total: Number(booking.totalPrice),
    checkIn: booking.checkIn.toISOString().slice(0, 10),
    selectedPaymentMethod,
    otherLabel: snapshot?.otherLabel ?? null,
    savedInstructions: selectedPaymentMethod
      ? (templates[selectedPaymentMethod] ?? "")
      : "",
  };
}

export async function saveBookingPaymentInstructionTemplate(input: {
  bookingId: string;
  hostId: string;
  method: PaymentMethodCode;
  body: string;
}) {
  const booking = await db.booking.findFirst({
    where: { id: input.bookingId, listing: { hostId: input.hostId } },
    select: {
      selectedPaymentMethod: true,
      listing: {
        select: {
          id: true,
          acceptedPaymentMethods: true,
          paymentInstructionTemplates: true,
        },
      },
    },
  });
  if (!booking || booking.selectedPaymentMethod !== input.method) {
    throw new Error("Booking not found");
  }

  const current = parsePaymentInstructionTemplates(
    booking.listing.paymentInstructionTemplates,
  );
  const next = { ...current, [input.method]: input.body.trim() };
  const validated = validatePaymentInstructionTemplates(
    next,
    booking.listing.acceptedPaymentMethods,
  );
  if (!validated.success) throw new Error("Payment instructions could not be saved");

  await db.listing.update({
    where: { id: booking.listing.id },
    data: {
      paymentInstructionTemplates: paymentInstructionTemplatesSnapshot(
        validated.value,
      ),
    },
  });
}

export async function confirmBooking(
  bookingId: string,
  hostId: string,
  options: {
    paymentInstructionsStatus?: "PENDING" | "NOT_NEEDED";
  } = {},
) {
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
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

    if (booking.responseDueAt <= now) {
      const expired = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: BookingStatus.PENDING,
          responseDueAt: { lte: now },
        },
        data: { status: BookingStatus.EXPIRED, respondedAt: now },
      });
      if (expired.count === 0) {
        throw new Error(
          "This booking request changed while you were responding",
        );
      }
      await tx.availabilityBlock.deleteMany({
        where: { bookingId, blockType: BlockType.BOOKING_HOLD },
      });
      await enqueueBookingEmails(tx, bookingId, [
        BookingEmailKind.GUEST_EXPIRED,
      ]);
      return { outcome: "expired" as const, bookingId };
    }

    const frozenDepositPolicies = parseDepositPoliciesSnapshot(
      booking.depositPolicySnapshot,
    );
    const advancePaymentStatus = frozenDepositPolicies?.advancePayment
      ? frozenDepositPolicies.advancePayment.dueTiming === "AFTER_ACCEPTANCE"
        ? "AWAITING_PAYMENT"
        : "UNTRACKED"
      : Number(booking.advancePaymentAmount ?? 0) > 0
        ? booking.advancePaymentStatus
        : "NOT_REQUIRED";
    const damageDepositStatus = frozenDepositPolicies?.damageDeposit
      ? frozenDepositPolicies.damageDeposit.dueTiming === "AFTER_ACCEPTANCE"
        ? "AWAITING_DEPOSIT"
        : "UNTRACKED"
      : Number(booking.damageDepositAmount ?? 0) > 0
        ? booking.damageDepositStatus
        : "NOT_REQUIRED";

    const confirmed = await tx.booking.updateMany({
      where: {
        id: bookingId,
        status: BookingStatus.PENDING,
        responseDueAt: { gt: now },
      },
      data: {
        status: BookingStatus.CONFIRMED,
        respondedAt: now,
        acceptedAt: now,
        paymentStatus: "AWAITING_PAYMENT",
        paymentInstructionsStatus:
          options.paymentInstructionsStatus ??
          (booking.selectedPaymentMethod === null ||
          booking.selectedPaymentMethod === "CASH_AT_PROPERTY" ||
          booking.selectedPaymentMethod === "ARRANGE_DIRECTLY"
            ? "NOT_NEEDED"
            : "PENDING"),
        paymentStatusUpdatedAt: now,
        advancePaymentStatus,
        damageDepositStatus,
        advancePaymentStatusUpdatedAt:
          advancePaymentStatus === "AWAITING_PAYMENT" ? now : null,
        damageDepositStatusUpdatedAt:
          damageDepositStatus === "AWAITING_DEPOSIT" ? now : null,
      },
    });
    if (confirmed.count === 0) {
      throw new Error("This booking request changed while you were responding");
    }
    await enqueueBookingEmails(tx, bookingId, [
      BookingEmailKind.GUEST_CONFIRMED,
    ]);
    const updated = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    return { outcome: "confirmed" as const, booking: updated };
  });

  if (result.outcome === "expired") {
    kickBookingEmailDelivery(result.bookingId);
    notifyBestEffort(async () => {
      const { notifyBookingEvent } =
        await import("@/lib/services/notification.service");
      await notifyBookingEvent(result.bookingId, "expired");
    });
    throw new Error(
      "This booking request expired before it could be confirmed",
    );
  }

  kickBookingEmailDelivery(result.booking.id);
  notifyBestEffort(async () => {
    const { notifyBookingEvent } =
      await import("@/lib/services/notification.service");
    await notifyBookingEvent(result.booking.id, "confirmed");
  });
  return result.booking;
}

export async function rejectBooking(
  bookingId: string,
  hostId: string,
  reason?: string,
) {
  const cleanReason = reason?.trim();
  if (!cleanReason)
    throw new Error("A reason is required when declining a booking request");

  const now = new Date();
  const result = await db.$transaction(async (tx) => {
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

    if (booking.responseDueAt <= now) {
      const expired = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: BookingStatus.PENDING,
          responseDueAt: { lte: now },
        },
        data: { status: BookingStatus.EXPIRED, respondedAt: now },
      });
      if (expired.count === 0) {
        throw new Error(
          "This booking request changed while you were responding",
        );
      }
      await tx.availabilityBlock.deleteMany({
        where: { bookingId, blockType: BlockType.BOOKING_HOLD },
      });
      await enqueueBookingEmails(tx, bookingId, [
        BookingEmailKind.GUEST_EXPIRED,
      ]);
      return { outcome: "expired" as const, bookingId };
    }

    const rejected = await tx.booking.updateMany({
      where: {
        id: bookingId,
        status: BookingStatus.PENDING,
        responseDueAt: { gt: now },
      },
      data: {
        status: BookingStatus.REJECTED,
        respondedAt: now,
        cancellationReason: cleanReason,
      },
    });
    if (rejected.count === 0) {
      throw new Error("This booking request changed while you were responding");
    }

    await tx.availabilityBlock.deleteMany({
      where: { bookingId, blockType: BlockType.BOOKING_HOLD },
    });
    await enqueueBookingEmails(tx, bookingId, [
      BookingEmailKind.GUEST_REJECTED,
    ]);

    const updated = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    return { outcome: "rejected" as const, booking: updated };
  });

  if (result.outcome === "expired") {
    kickBookingEmailDelivery(result.bookingId);
    notifyBestEffort(async () => {
      const { notifyBookingEvent } =
        await import("@/lib/services/notification.service");
      await notifyBookingEvent(result.bookingId, "expired");
    });
    throw new Error("This booking request expired before it could be declined");
  }

  kickBookingEmailDelivery(result.booking.id);
  notifyBestEffort(async () => {
    const { notifyBookingEvent } =
      await import("@/lib/services/notification.service");
    await notifyBookingEvent(result.booking.id, "rejected");
  });
  return result.booking;
}

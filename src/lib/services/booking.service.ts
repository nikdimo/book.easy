import "server-only";
import { db } from "@/lib/db";
import {
  BookingEmailKind,
  BookingStatus,
  BlockType,
  ListingStatus,
  type Prisma,
} from "@prisma/client";
import {
  buildPriceOverrideMap,
  computeStayQuote,
  toStayPromotion,
} from "@/lib/utils/stay-pricing";
import { isAvailabilityOverlapConstraintError } from "@/lib/utils/db-errors";
import {
  isStayWithinAvailabilityWindows,
  windowsOverlappingStay,
} from "@/lib/utils/availability-windows";
import {
  bookingStayRequestIssueMessage,
  classifyBookingStayRequest,
} from "@/lib/utils/booking-stay-request";
import { decideStayAvailability } from "@/lib/utils/stay-availability";
import type { ChangeoverWeekdayName } from "@/lib/utils/weekly-stay";
import {
  conversionRate,
  type ConversionContext,
} from "@/lib/currency/convert";
import { newBookingReference } from "@/lib/utils/booking-reference";
import {
  enqueueBookingEmails,
  kickBookingEmailDelivery,
} from "@/lib/services/booking-email-outbox.service";
import { recordBookingTimelineEvent } from "@/lib/services/booking-timeline.service";
import { houseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";
import {
  BOOKING_PARTY_COUNT_MAX,
  bookingPartyIssues,
  bookingPartyOccupancy,
  normalizeBookingParty,
  type BookingPartyInput,
} from "@/lib/booking-party";
import { houseRulesVersion } from "@/lib/host/v2/house-rules-version.server";
import {
  isPaymentMethodCode,
  parsePaymentMethodsSnapshot,
  paymentMethodsSnapshot,
  type PaymentMethodCode,
} from "@/lib/payments/payment-methods";
import {
  parsePaymentInstructionStore,
  paymentInstructionStoreSnapshot,
  resolvePaymentInstructionsForMethod,
  validatePaymentInstructionTemplates,
  validatePaymentMethodDetailsMap,
} from "@/lib/payments/payment-instruction-templates";
import {
  methodSupportsPaymentDetails,
  type PaymentDetailFieldValues,
} from "@/lib/payments/payment-details";
import type {
  BookingPaymentDecision,
  BookingPaymentRequestPrefill,
} from "@/lib/payments/booking-payment-request";
import { bookingPaymentObligations } from "@/lib/payments/booking-payment-request";
import {
  acceptanceDecisionError,
  acceptanceDecisionRule,
  instructionsStatusForDecision,
  obligationTrackIsOpen,
  resolveRequestMethod,
} from "@/lib/payments/booking-acceptance";
import {
  calculateDepositAmounts,
  createDepositPoliciesSnapshot,
  parseDepositPoliciesSnapshot,
} from "@/lib/payments/deposit-policies";
import {
  calculateCancellationSettlement,
  cancellationPolicySnapshot,
  parseCancellationPolicySnapshot,
} from "@/lib/payments/cancellation-policy";
import {
  paymentStateAfterAcceptance,
  paymentStateAfterCancellation,
} from "@/lib/services/booking-payment-status.service";
import { reviewWindowOpensAt } from "@/lib/services/review-window";
import {
  BOOKING_RESPONSE_WINDOW_HOURS,
  bookingResponseDueAt,
  bookingResponseWindowIsOpen,
} from "@/lib/services/booking-response-window";
import {
  dbDateToLocalDate,
  dbDateToYmd,
  nightsBetweenYmd,
  todayYmd,
  ymdToDbDate,
} from "@/lib/utils/date-only";

export { BOOKING_RESPONSE_WINDOW_HOURS };

/** Fire a notification without letting failures — including a failed dynamic import of
 * the email module — propagate to the caller. A successfully committed booking
 * mutation must never appear to fail just because the email step had a problem. */
function notifyBestEffort(fn: () => Promise<void>): void {
  fn().catch(() => {
    /* non-blocking */
  });
}

/**
 * Transitions confirmed bookings whose stay has ended to COMPLETED.
 *
 * "Ended" means the checkout *instant* has been reached — the booking's own frozen
 * checkout time on its checkout date, read in the marketplace zone (`reviewWindowOpensAt`).
 * It used to mean the start of the checkout calendar day, which completed a stay up to
 * twelve hours before the guest had actually left and opened the review window with it
 * (L7). Midnight is not checkout.
 *
 * Idempotent and safe to run concurrently: every write is guarded on the status it is
 * moving away from, so two sweeps racing each other produce one transition and one
 * timeline event. Called by `bookings:process`, by the review-reminder timer, and by
 * the booking reads themselves — none of the three is the only way a stay completes.
 */
export async function completePastBookings(now = new Date()): Promise<void> {
  // The marketplace's calendar date, in the terms `checkOut` is stored in.
  //
  // `checkOut` is `@db.Date`, which Prisma reads back as UTC midnight, and the old
  // server-local midnight was an *instant* two hours behind that on a UTC+2 host — so
  // a stay ending today never satisfied `lte` and only completed the day after
  // checkout (M6). Comparing UTC midnight to UTC midnight makes the sweep land on the
  // intended day, and `todayYmd` is what decides which day that is.
  //
  // This is the *candidate* filter, not the decision: a stay checking out tomorrow can
  // never have ended yet, whatever hour it names, while a stay checking out today may
  // or may not have. The hour is settled per booking below, off its frozen snapshot.
  const today = ymdToDbDate(todayYmd(undefined, now));
  const candidates = await db.booking.findMany({
    where: {
      status: BookingStatus.CONFIRMED,
      checkOut: { lte: today },
    },
    select: { id: true, checkOut: true, houseRulesSnapshot: true },
  });
  const due = candidates
    .map((booking) => ({
      id: booking.id,
      endedAt: reviewWindowOpensAt(booking),
    }))
    .filter((booking) => booking.endedAt.getTime() <= now.getTime());
  if (due.length === 0) return;

  // The status and its history entry go in together, one guarded update per booking.
  // The guard is what makes the loser of a concurrent sweep write nothing at all, and
  // the per-booking count is what says which rows actually moved — a booking cancelled
  // between the read above and the write below must not collect a COMPLETED entry for a
  // transition that never happened.
  const completed = await db.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const booking of due) {
      const result = await tx.booking.updateMany({
        where: { id: booking.id, status: BookingStatus.CONFIRMED },
        data: { status: BookingStatus.COMPLETED },
      });
      if (result.count === 0) continue;
      ids.push(booking.id);
      await recordBookingTimelineEvent(tx, {
        bookingId: booking.id,
        type: "COMPLETED",
        // Nobody did this. The stay ended and the calendar caught up with it.
        actor: { role: "SYSTEM" },
        // The moment the stay actually ended, which is the moment this event records —
        // not the moment a sweep happened to notice. Already proven to be at or before
        // `now` by the filter above, so it can never be stamped in the future.
        createdAt: booking.endedAt,
      });
    }
    return ids;
  });
  if (completed.length === 0) return;

  // Completing the stay also opens the sealed 14-day review window. Invitations are
  // independently deduplicated, so a retry cannot send duplicate opening messages.
  const { ensureReviewInvitationsForBooking } =
    await import("@/lib/services/review.service");
  await Promise.allSettled(
    completed.map((bookingId) =>
      ensureReviewInvitationsForBooking(bookingId, now),
    ),
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
      await recordBookingTimelineEvent(tx, {
        bookingId: booking.id,
        type: "EXPIRED",
        // Nobody declined this; the answer window closed on its own.
        actor: { role: "SYSTEM" },
      });
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
        // Never hand a guest the host's private reusable payment details; see
        // `getGuestBookingWithHost` for why `include` alone would.
        omit: { paymentInstructionTemplates: true },
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
        // `include` returns every scalar on the listing, and one of them is the host's
        // private reusable payment details. A guest is entitled to the listing they
        // booked, never to the coordinates their host saved for other bookings — what
        // this guest may see is only what was actually sent to them, which travels on
        // the booking's own frozen snapshot.
        omit: { paymentInstructionTemplates: true },
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
        // Never hand a guest the host's private reusable payment details; see
        // `getGuestBookingWithHost` for why `include` alone would.
        omit: { paymentInstructionTemplates: true },
        include: {
          property: true,
          images: { where: { isPrimary: true }, take: 1 },
        },
      },
    },
  });
}

/** A host booking their own listing. Thrown before anything is written, so nothing —
 *  no booking, no hold, no conversation, no notification, no email — is created for it.
 *  Exported so callers and tests can recognise the refusal without matching on prose. */
export const SELF_BOOKING_ERROR =
  "You can't book your own listing.";

/**
  * New bookings always carry dates. The legacy period-id arm remains accepted by the
  * TypeScript boundary only so old callers receive an explicit migration error rather
  * than an ambiguous missing-date error; it never creates a booking.
 *
 * A `never`-typed counterpart on each arm is what makes this a real either/or in
 * TypeScript rather than four optional fields: a caller cannot pass a checkout beside a
 * fixed stay and have it compile. `classifyBookingStayRequest` enforces the same rule at
 * runtime, for the callers TypeScript never sees.
 */
type BookingStaySelectionInput =
  | { checkIn: Date; checkOut: Date; fixedStayPeriodId?: undefined }
  | { fixedStayPeriodId: string; checkIn?: undefined; checkOut?: undefined };

type CreateBookingInput = BookingStaySelectionInput & CreateBookingCommonInput;

interface CreateBookingCommonInput {
  listingId: string;
  guestId: string;
  /**
   * The party, when the caller collected one. Adults, children, infants and pets are
   * each stored on their own, and `guestCount` below is derived from the first two
   * rather than taken from the caller.
   *
   * Optional because a caller may still book by capacity alone (`guestCount`), and a
   * booking made that way records no party rather than a fabricated one — the same
   * distinction the nullable columns draw for every booking taken before they existed.
   */
  party?: BookingPartyInput;
  /**
   * Capacity: adults + children. Ignored when `party` is supplied, because the party is
   * then the only thing that decides it; required when it is not.
   */
  guestCount?: number;
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

/** @deprecated Weekly listings now book dates constrained by their weekly rule. */
export const FIXED_STAYS_LISTING_ERROR =
  "This place is booked as whole stays. Reload the page and choose one of the stays the host offers.";

/** The mirror: a listing that sells by date, handed the id of a stay it does not sell. */
export const FLEXIBLE_LISTING_ERROR =
  "This place is booked by date. Reload the page and choose your check-in and check-out.";

/**
 * One sentence for every way a named fixed stay turns out not to be bookable.
 *
 * Deliberately the same words for "no such period", "that period belongs to another
 * listing" and "the host switched it off": telling those apart would let a guessed id
 * confirm that a period exists somewhere, and none of the three is a distinction the
 * guest can act on differently.
 */
/** A request still shaped like the old period-based booking. */
export const LEGACY_PERIOD_REQUEST_ERROR =
  "This place now takes bookings by date. Reload the page and choose your dates.";

/** The listing sells weekly stays but its host has not chosen a changeover day yet. */
export const NO_CHANGEOVER_DAY_ERROR =
  "This place is not taking bookings right now. Message the host about your dates.";

/**
 * One sentence per way a weekly stay can be the wrong shape.
 *
 * Each names the rule the guest tripped over and the day it turns on, because "that is
 * not a valid stay" tells somebody looking at a calendar nothing they can act on.
 */
export function weeklyStayRefusal(
  reason: string,
  changeoverWeekday: ChangeoverWeekdayName | null,
): string {
  const day = changeoverWeekday
    ? WEEKDAY_LABELS[changeoverWeekday]
    : "the host's changeover day";
  switch (reason) {
    case "NO_CHANGEOVER_DAY":
      return NO_CHANGEOVER_DAY_ERROR;
    case "WRONG_CHECK_IN_DAY":
      return `This place is booked by the week. Check-in must be on a ${day}.`;
    case "WRONG_CHECK_OUT_DAY":
      return `This place is booked by the week, so check-out must also be on a ${day}.`;
    case "BELOW_MINIMUM":
      return "That stay is shorter than this host's minimum stay.";
    case "ABOVE_MAXIMUM":
      return "That stay is longer than this host's maximum stay.";
    case "STAY_IN_PAST":
      return "Check-in date cannot be in the past";
    default:
      return "Those dates are not available. Please choose different dates.";
  }
}

/**
 * The same decision, said the way a flexible listing's guest has always heard it.
 *
 * Both modes now go through `decideStayAvailability`, but they do not share a
 * vocabulary: a weekly guest is told about weeks and changeover days, a flexible guest
 * about nights. These three sentences are the ones `createBooking` already produced from
 * its own duplicated checks, kept verbatim so routing through the shared rule changes
 * what is *enforced* without changing what anyone reads.
 */
export function flexibleStayRefusal(
  reason: string,
  pricingRule: { minNights: number; maxNights: number } | null,
): string {
  switch (reason) {
    case "BELOW_MINIMUM":
      return `Minimum stay is ${pricingRule?.minNights ?? 1} nights`;
    case "ABOVE_MAXIMUM":
      return `Maximum stay is ${pricingRule?.maxNights ?? 0} nights`;
    case "STAY_IN_PAST":
      return "Check-in date cannot be in the past";
    default:
      return "Those dates are not available. Please choose different dates.";
  }
}

const WEEKDAY_LABELS: Record<ChangeoverWeekdayName, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

export const FIXED_STAY_UNAVAILABLE_ERROR =
  "That stay is no longer offered. Please choose another.";

export const FIXED_STAY_PAST_ERROR =
  "That stay has already started. Please choose another.";

/** The stay a booking is actually for, resolved from the database inside the lock. */
/**
 * The stay a booking is for.
 *
 * One shape in both modes: two calendar dates and their length. Weekly listings used to
 * resolve to a stored row and freeze a snapshot of it; they no longer do, because a
 * weekly stay is a rule rather than a row. `Booking.fixedStayPeriodId` and
 * `fixedStaySnapshot` are left in the schema and stay readable on the bookings that
 * already carry them — nothing new writes either.
 */
type ResolvedBookingStay = {
  kind: "FLEXIBLE" | "FIXED_STAYS";
  checkIn: Date;
  checkOut: Date;
  checkInYmd: string;
  checkOutYmd: string;
  numberOfNights: number;
};

/**
 * What is being booked, decided against the mode the listing has *right now*.
 *
 * Called inside the booking transaction, after the advisory lock is held, so that a host
 * switching modes or switching a period off races this on the same lock rather than
 * beside it. Everything downstream — the block query, the quote, the stored dates and the
 * hold — reads the dates this returns and never the request's.
 *
 * Both modes use the guest's dates. Weekly mode adds the changeover-day/whole-week rule;
 * the listing-wide availability calendar and stay limits still apply to both modes.
 */
async function resolveBookingStay(
  listing: {
    id: string;
    bookingMode: string;
    availabilityMode: string;
    changeoverWeekday: ChangeoverWeekdayName | null;
    pricingRule: { minNights: number; maxNights: number } | null;
  },
  input: { checkIn?: Date; checkOut?: Date; fixedStayPeriodId?: string },
): Promise<ResolvedBookingStay> {
  // A period id is no longer a way to book anything. Weekly stays are a rule about
  // weekdays and length rather than a list of rows, so a request still carrying one is
  // either a stale page or someone probing the old shape — and both are refused rather
  // than quietly interpreted as the dates beside them.
  if (input.fixedStayPeriodId) throw new Error(LEGACY_PERIOD_REQUEST_ERROR);
  if (!input.checkIn || !input.checkOut) {
    throw new Error("Choose your dates before sending your request.");
  }

  const checkIn = input.checkIn;
  const checkOut = input.checkOut;
  // The stay as calendar dates. `checkIn`/`checkOut` arrive as the UTC-midnight instants
  // the `@db.Date` columns take, so every night, price and length decision below reads
  // them here rather than off the server's own clock.
  const checkInYmd = dbDateToYmd(checkIn);
  const checkOutYmd = dbDateToYmd(checkOut);
  const sellsWeeklyStays = listing.bookingMode === "FIXED_STAYS";

  // The shared rule, for **both** booking modes, so this path, the search filter and the
  // guest calendar cannot come to three different answers about the same pair of dates.
  // It used to be consulted only for weekly listings, and the flexible half of the rule
  // was re-implemented further down this file — which is how the past-date check came to
  // be missing from the booking transaction for flexible listings entirely.
  //
  // It fails closed on a weekly listing whose host has not chosen a changeover day.
  const decision = decideStayAvailability({
    bookingMode: sellsWeeklyStays ? "FIXED_STAYS" : "FLEXIBLE",
    // Availability windows are checked once inside the transaction for both booking
    // modes, against windows read under the listing lock. This call decides the shape,
    // the stay limits and the past-date rule.
    availabilityMode: "OPEN",
    windows: [],
    changeoverWeekday: listing.changeoverWeekday,
    limits: {
      minNights: listing.pricingRule?.minNights ?? 1,
      maxNights: listing.pricingRule?.maxNights ?? null,
    },
    checkIn: checkInYmd,
    checkOut: checkOutYmd,
    today: todayYmd(),
  });
  if (!decision.offered) {
    throw new Error(
      sellsWeeklyStays
        ? weeklyStayRefusal(decision.reason, listing.changeoverWeekday)
        : flexibleStayRefusal(decision.reason, listing.pricingRule),
    );
  }

  return {
    // Both modes now book an ordinary pair of dates. What differs is which pairs the
    // listing accepts, not what a booking is made of — which is why nothing below this
    // line has a second shape to handle.
    kind: sellsWeeklyStays ? "FIXED_STAYS" : "FLEXIBLE",
    checkIn,
    checkOut,
    checkInYmd,
    checkOutYmd,
    numberOfNights: nightsBetweenYmd(checkInYmd, checkOutYmd),
  };
}

export async function createBooking(input: CreateBookingInput) {
  const {
    listingId,
    guestId,
    guestNote,
    selectedPaymentMethod,
    guestLocale,
    display,
    houseRulesAcceptedAt,
    expectedHouseRulesVersion,
  } = input;

  // The party decides the capacity when there is one; `guestCount` is only consulted
  // for a caller that supplied no party at all. Nothing is derived from the two
  // together, so a request cannot state a party of six and a capacity of one.
  const party = input.party ? normalizeBookingParty(input.party) : null;
  const guestCount = party ? bookingPartyOccupancy(party) : input.guestCount;
  if (guestCount === undefined) {
    throw new Error("A booking needs a party or a guest count.");
  }
  // The web action validates this already, but `createBooking` is also called by
  // background work and tests and is the final boundary before persistence. Keep the
  // legacy count-only path for deploy compatibility without allowing a raw caller to
  // create a zero, negative, fractional or non-finite party. A structured party gets
  // the same ceiling through `bookingPartyIssues` inside the transaction.
  if (
    !Number.isInteger(guestCount) ||
    guestCount < 1 ||
    guestCount > BOOKING_PARTY_COUNT_MAX
  ) {
    throw new Error("That party size can't be booked. Check the guest counts.");
  }

  // Which of the two ways this request asks for a stay, before anything is loaded: a
  // request that has not said coherently what it is booking cannot be measured against a
  // listing at all. `createBookingAction` asked the same question through the schema;
  // this is the boundary for every caller that never passes through one.
  const requested = classifyBookingStayRequest(input);
  if ("issue" in requested) {
    throw new Error(bookingStayRequestIssueMessage(requested.issue));
  }

  let booking;
  try {
    booking = await db.$transaction(async (tx) => {
      // 0. Serialize all writers (bookings + manual blocks) for this listing so two
      // concurrent requests for overlapping dates can't both pass the overlap check
      // below before either insert is visible (the transaction's default READ COMMITTED
      // isolation does not prevent that on its own). Lock is released at commit/rollback.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;

      // 1. Verify listing exists and is approved.
      const listing = await tx.listing.findFirst({
        where: { id: listingId, status: "APPROVED" },
        include: {
          pricingRule: true,
          promotions: {
            where: { disabledAt: null },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!listing) {
        throw new Error("Listing not found or not available");
      }

      // 1a. A host cannot be their own guest.
      //
      // This is the authoritative check and it is deliberately the first thing decided
      // after the listing is known — before the booking row, the availability hold, the
      // conversation, the notification and the queued emails, every one of which a
      // self-booking would otherwise create. A self-booking is not a harmless oddity:
      // it blocks the host's own calendar with a BOOKING_HOLD, opens a conversation
      // whose two participants are the same person, invites that person to review
      // themselves in both directions, and counts toward the confirmed-booking total
      // that decides whether they still see first-time-host guidance.
      //
      // Hiding the widget on the listing page is a courtesy to a host who wandered onto
      // their own page. It is not the enforcement — this is, and it holds for a request
      // posted straight at the action or for any future caller of this service.
      if (listing.hostId === guestId) {
        throw new Error(SELF_BOOKING_ERROR);
      }

      if (!listing.pricingRule) {
        throw new Error("Listing pricing not configured");
      }

      // 1b. The stay itself, resolved against the booking mode this listing has *now* —
      // inside the lock, so a host switching mode or switching a period off serializes
      // against this request rather than racing it. Everything below reads these dates.
      const stay = await resolveBookingStay(listing, input);
      const { checkIn, checkOut, numberOfNights } = stay;

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
      const currentCancellationPolicy = cancellationPolicySnapshot(
        listing.freeCancellationDaysBeforeCheckIn,
        listing.cancellationPolicyReviewedAt,
      );
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

      // Availability is listing-wide in both modes. Every window touching the stay is
      // loaded so adjacent windows can be merged by the shared coverage rule.
      const availabilityWindows = await tx.listingAvailabilityWindow.findMany({
        where: { listingId, ...windowsOverlappingStay(checkIn, checkOut) },
        select: { startDate: true, endDate: true },
      });
      if (
        !isStayWithinAvailabilityWindows({
          availabilityMode: listing.availabilityMode,
          windows: availabilityWindows,
          checkIn,
          checkOut,
        })
      ) {
        throw new Error(
          "These dates are not open for booking. Please select different dates.",
        );
      }

      // 2. Validate the party, then the capacity it adds up to.
      //
      // The capacity rule is untouched: `guestCount` is still adults + children and is
      // still what `maxGuests` is compared against. Infants and pets are checked for
      // their own reasons — a party has to have an adult in it, and a pet needs a
      // listing whose house rules take one — and neither of them is ever added to the
      // number a host set their capacity to.
      //
      // The pet policy is read from the listing row loaded in this transaction, not
      // from anything the request carried, and `ASK_HOST` stays a yes here: it is the
      // policy of a host who takes a small dog but not a Great Dane, and refusing it
      // outright would turn a conversation into a rejection.
      if (party) {
        const issues = bookingPartyIssues(party, {
          petsAllowed: currentHouseRules.petPolicy !== "NOT_ALLOWED",
        });
        if (issues.includes("COUNT_OUT_OF_RANGE")) {
          throw new Error("That party size can't be booked. Check the guest counts.");
        }
        if (issues.includes("NO_ADULTS")) {
          throw new Error("Add at least one adult to the booking.");
        }
        if (issues.includes("PETS_NOT_ALLOWED")) {
          throw new Error("This host does not accept pets.");
        }
      }

      if (guestCount > listing.maxGuests) {
        throw new Error(`Maximum ${listing.maxGuests} guests allowed`);
      }

      // 3. Stay length is no longer re-checked here.
      //
      // `resolveBookingStay` above runs `decideStayAvailability` for both booking modes,
      // and that is where the listing's minimum and maximum now live — one rule, one
      // reading of a stored `maxNights` of zero, one place for a future caller to find.
      // This block used to be a second flexible-only copy, which is exactly the drift
      // the shared helper exists to prevent.
      //
      // `numberOfNights` is still counted off the stored calendar dates rather than with
      // `differenceInDays`, which counts *local* calendar days: over the UTC-midnight
      // values these are, an autumn DST change makes the last day look short and drops a
      // night, so a 24-27 October stay would be measured as two nights (M6).

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
      // `checkIn`/`checkOut` are the stored `@db.Date` instants — right for every
      // query above, and the one flavour `computeStayQuote` must not be handed: it
      // walks calendar days off local fields, so on a server behind UTC every night
      // would shift back a day and take the date overrides and promotion windows with
      // it. Converted here, once, at the boundary.
      const quote = computeStayQuote({
        baseNightly,
        cleaningFee: Number(listing.pricingRule.cleaningFee),
        checkIn: dbDateToLocalDate(checkIn),
        checkOut: dbDateToLocalDate(checkOut),
        overrides: overrideMap,
        promotions: listing.promotions.map((promotion) =>
          toStayPromotion({
            id: promotion.id,
            type: promotion.type,
            discountPercent: promotion.discountPercent,
            minimumNights: promotion.minimumNights,
            freeCleaning: promotion.freeCleaning,
            roundToWholeUnit: promotion.roundToWholeUnit,
            startDate: promotion.startDate,
            endDate: promotion.endDate,
            createdAt: promotion.createdAt,
          }),
        ),
      });
      // A rounded effective average, stored for compatibility and for nothing else.
      // Three nights at 100 / 100 / 101 put `100.33` here against a `301.00` total, so
      // multiplying it by the nights reconstructs neither the accommodation subtotal nor
      // the total (audit L2). `priceBreakdown.accommodationSubtotal` below is the
      // authoritative figure, and `resolveBookingPricing` in `@/lib/booking-pricing` is
      // the only supported way to read either one back.
      const nightlyRate = quote.effectiveAverageNightly;
      const cleaningFee = quote.cleaningFee;
      // Zero, always, and not read from anywhere.
      //
      // There is no configurable percentage behind this. The old, unread
      // `PricingRule.serviceFeePercent` placeholder was removed with a guarded migration;
      // introducing a platform fee remains a product project with display, snapshot,
      // reconciliation and rollout work of its own.
      const serviceFee = 0;
      const totalPrice = quote.total + Number(serviceFee);
      // Two amounts, each resolved on its own against the same booking total and never
      // added together: the advance payment is a part of `totalPrice`, while the damage
      // deposit is separate security money the host expects to give back.
      //
      // Both are quoted in `listing.pricingRule.currency` — the same unit as
      // `totalPrice`, `priceBreakdown` and the `currency` column written below — and
      // that currency is passed in rather than inferred, so a policy carrying any other
      // label resolves to null instead of being relabelled. The snapshot above has
      // already refused a listing whose stored deposit currency drifted from its pricing
      // currency, so this is the second lock on that door, on the path that actually
      // writes the money columns. The advance payment is additionally capped at
      // `totalPrice`, because it is part of that total and cannot exceed it.
      const { advancePaymentAmount, damageDepositAmount } =
        currentDepositPolicies.status === "REVIEWED"
          ? calculateDepositAmounts(
              currentDepositPolicies,
              String(totalPrice),
              listing.pricingRule.currency,
            )
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

      // 6. Create booking. Open the response window only after every awaited check has
      // completed under the listing lock. Capturing this before the transaction (or
      // before waiting for the lock) allowed a request to be inserted after check-in
      // with a deadline that was already in the past.
      //
      // Built from the snapshot this row will actually *store*, not from the listing:
      // the snapshot is only written alongside `houseRulesAcceptedAt`, so a request
      // taken without one must be measured against the same default that
      // `confirmBooking` will read back, or the two would disagree about when the
      // window closed.
      const createdAt = new Date();
      const reference = newBookingReference(createdAt);
      const storedHouseRulesSnapshot = houseRulesAcceptedAt
        ? currentHouseRules
        : null;
      const responseDueAt = bookingResponseDueAt({
        createdAt,
        checkIn,
        houseRulesSnapshot: storedHouseRulesSnapshot,
      });
      // Same-day requests are allowed; a request nobody could answer is not. When the
      // stay's arrival time has already passed there is no window left to open, so the
      // request is refused at creation rather than created dead and swept a moment later.
      if (responseDueAt.getTime() <= createdAt.getTime()) {
        throw new Error(
          "Check-in for these dates has already passed, so this request could not be answered. Please choose different dates.",
        );
      }

      const created = await tx.booking.create({
        data: {
          reference,
          createdAt,
          listingId,
          guestId,
          guestLocale: guestLocale ?? null,
          checkIn,
          checkOut,
          guestCount,
          // The party as the guest chose it, each part on its own column. Only the
          // first two are inside `guestCount` above; infants and pets sit beside it so
          // the host learns about the cot and the dog without either one consuming
          // capacity. A caller that supplied no party leaves all four NULL rather than
          // zero — "nobody asked" is not "none", and a zero here would be this
          // function inventing an answer on the guest's behalf.
          ...(party
            ? {
                adults: party.adults,
                children: party.children,
                infants: party.infants,
                pets: party.pets,
              }
            : {}),
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
          // Deliberately absent. `fixedStayPeriodId` and `fixedStaySnapshot` stay in the
          // schema so bookings sold under the old period model keep reading back exactly
          // as they were sold, but a weekly booking is an ordinary pair of dates and
          // writes neither. Both are left null on every booking taken from here on.
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
          cancellationPolicySnapshot:
            currentCancellationPolicy as unknown as Prisma.InputJsonObject,
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

      // The request is the first entry in this booking's permanent history, and it is
      // written here rather than by the notification that announces it: the
      // announcement is best-effort, the record is not.
      await recordBookingTimelineEvent(tx, {
        bookingId: created.id,
        type: "REQUESTED",
        actor: { role: "GUEST", userId: guestId },
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

      if (cancelledBy === "admin") {
        const admin = await tx.user.findFirst({
          where: { id: userId, role: "ADMIN", isActive: true },
          select: { id: true },
        });
        if (!admin) throw new Error("Only an active administrator can cancel as support");
      }

      if (
        booking.status !== BookingStatus.PENDING &&
        booking.status !== BookingStatus.CONFIRMED
      ) {
        throw new Error("This booking cannot be cancelled");
      }

      const now = new Date();
      if (
        booking.status === BookingStatus.CONFIRMED &&
        dbDateToYmd(booking.checkIn) <= todayYmd(undefined, now)
      ) {
        throw new Error(
          "Confirmed bookings cannot be cancelled through the ordinary flow after check-in. Contact support.",
        );
      }

      let settlement: ReturnType<typeof calculateCancellationSettlement> | null = null;
      if (booking.status === BookingStatus.CONFIRMED) {
        const policy = parseCancellationPolicySnapshot(
          booking.cancellationPolicySnapshot,
        );
        const advanceAmount = Number(booking.advancePaymentAmount ?? 0);
        // Two readings of the same three columns, and the difference between them is the
        // whole of what "reported" means.
        //
        // *Received* counts a guest's own `*_REPORTED` claim, because a host who simply
        // never confirms must not be able to make a refund obligation disappear by
        // staying silent. *Confirmed* counts only what the receiving side actually
        // confirmed. The settlement is built from the first and records the second, so
        // the obligation is opened either way but is marked provisional when it rests on
        // a claim nobody has verified.
        const advanceReceived = [
          "PAYMENT_REPORTED",
          "PAYMENT_CONFIRMED",
        ].includes(booking.advancePaymentStatus)
          ? advanceAmount
          : 0;
        const advanceConfirmed =
          booking.advancePaymentStatus === "PAYMENT_CONFIRMED" ? advanceAmount : 0;
        // In the split request model paymentStatus tracks the accommodation balance.
        // Legacy rows without an advance still use it for the full accommodation sum.
        const balanceAmount = Math.max(0, Number(booking.totalPrice) - advanceAmount);
        const balanceWhenReceived =
          advanceAmount > 0 ? balanceAmount : Number(booking.totalPrice);
        const accommodationBalanceReceived = [
          "PAYMENT_REPORTED",
          "PAYMENT_CONFIRMED",
        ].includes(booking.paymentStatus)
          ? balanceWhenReceived
          : 0;
        const accommodationBalanceConfirmed =
          booking.paymentStatus === "PAYMENT_CONFIRMED" ? balanceWhenReceived : 0;
        settlement = calculateCancellationSettlement({
          cancelledBy,
          checkIn: booking.checkIn,
          cancelledOn: todayYmd(undefined, now),
          // A legacy unanswered policy never grants a retention right. Treating it as
          // full refund is a safe fallback, not a public default for the listing.
          freeDays:
            policy?.status === "REVIEWED"
              ? policy.freeCancellationDaysBeforeCheckIn ?? 0
              : 3650,
          advanceReceived,
          advanceConfirmed,
          accommodationBalanceReceived,
          accommodationBalanceConfirmed,
          damageDepositReceived:
            booking.damageDepositStatus === "DEPOSIT_REPORTED" ||
            booking.damageDepositStatus === "DEPOSIT_CONFIRMED",
          damageDepositConfirmed:
            booking.damageDepositStatus === "DEPOSIT_CONFIRMED",
        });
      }

      // Status, permanent-history type and actor role in one table, so a canceller can
      // never be given a status without also being given the history entry that says
      // who did it.
      const cancellation = {
        guest: {
          status: BookingStatus.CANCELLED_BY_GUEST,
          event: "CANCELLED_BY_GUEST",
          role: "GUEST",
        },
        host: {
          status: BookingStatus.CANCELLED_BY_HOST,
          event: "CANCELLED_BY_HOST",
          role: "HOST",
        },
        admin: {
          status: BookingStatus.CANCELLED_BY_ADMIN,
          event: "CANCELLED_BY_ADMIN",
          role: "ADMIN",
        },
      } as const;

      const cancelled = await tx.booking.updateMany({
        where: {
          id: bookingId,
          status: booking.status,
        },
        data: {
          status: cancellation[cancelledBy].status,
          respondedAt:
            booking.status === BookingStatus.PENDING
              ? new Date()
              : booking.respondedAt,
          cancellationReason: reason,
          cancelledAt: now,
          ...(settlement
            ? {
                accommodationRefundAmount: settlement.accommodationRefundAmount,
                ...paymentStateAfterCancellation({
                  accommodationRefundAmount: settlement.accommodationRefundAmount,
                  accommodationRefundStatus: booking.accommodationRefundStatus,
                }),
                accommodationRefundStatusUpdatedAt:
                  settlement.accommodationRefundAmount > 0 ? now : null,
                cancellationSettlementSnapshot: {
                  // Version 2 carries the provenance of the amounts. Version-1 rows are
                  // still read back, as UNKNOWN, and nothing rewrites them.
                  version: 2,
                  calculatedAt: now.toISOString(),
                  freeCancellation: settlement.freeCancellation,
                  accommodationRefundAmount: settlement.accommodationRefundAmount,
                  retainableAdvanceAmount: settlement.retainableAdvanceAmount,
                  damageDepositReturnRequired:
                    settlement.damageDepositReturnRequired,
                  confirmedRefundAmount: settlement.confirmedRefundAmount,
                  refundBasis: settlement.refundBasis,
                  depositReturnBasis: settlement.depositReturnBasis,
                },
              }
            : {}),
        },
      });
      if (cancelled.count === 0) {
        throw new Error("This booking changed while it was being cancelled");
      }
      await recordBookingTimelineEvent(tx, {
        bookingId,
        type: cancellation[cancelledBy].event,
        actor: { role: cancellation[cancelledBy].role, userId },
      });

      // Cancellation opens an obligation; it never claims the refund happened. Keep
      // that opening in the same append-only payment timeline as every later report
      // and confirmation so support can reconstruct why AWAITING_REFUND appeared.
      if (settlement && settlement.accommodationRefundAmount > 0) {
        await tx.bookingPaymentStatusEvent.create({
          data: {
            bookingId,
            actorId: userId,
            eventType: "CANCELLATION_OPENED_ACCOMMODATION_REFUND",
            paymentStatus: booking.paymentStatus,
            advancePaymentStatus: booking.advancePaymentStatus,
            damageDepositStatus: booking.damageDepositStatus,
            accommodationRefundStatus: "AWAITING_REFUND",
            depositStatus: booking.depositStatus,
          },
        });
      }
      await tx.bookingPaymentRequest.updateMany({
        where: {
          bookingId,
          status: { in: ["DRAFT", "SENT"] },
        },
        data: { status: "CANCELLED" },
      });

      // Release availability hold
      await tx.availabilityBlock.deleteMany({
        where: {
          bookingId: bookingId,
          blockType: BlockType.BOOKING_HOLD,
        },
      });
      // Both parties, every time, and worded for who actually cancelled.
      //
      // This used to be a single ternary over three cases, so "admin" fell into the
      // else-branch: a support cancellation emailed the guest and sent the host nothing.
      // A guest who cancelled their own booking also got no email — no written record of
      // a settlement they may owe or be owed — because the guest-cancelled branch only
      // ever mailed the host.
      //
      // In-app notifications already covered all three cases for both sides. Email is
      // the channel that reaches someone who is not logged in, which is why the gap here
      // was the one a party actually noticed.
      const cancellationEmails: BookingEmailKind[] = [
        BookingEmailKind.GUEST_CANCELLED,
      ];
      if (cancelledBy === "guest") {
        cancellationEmails.push(BookingEmailKind.HOST_CANCELLED_BY_GUEST);
      } else if (cancelledBy === "admin") {
        cancellationEmails.push(BookingEmailKind.HOST_CANCELLED_BY_ADMIN);
      }
      // A host who cancelled it themselves needs no email about their own action.
      await enqueueBookingEmails(tx, bookingId, cancellationEmails);

      return tx.booking.findUniqueOrThrow({ where: { id: bookingId } });
    })
    .then((updated) => {
      kickBookingEmailDelivery(updated.id);
      notifyBestEffort(async () => {
        const { notifyBookingEvent } =
          await import("@/lib/services/notification.service");
        await notifyBookingEvent(
          updated.id,
          cancelledBy === "guest"
            ? "cancelled-by-guest"
            : cancelledBy === "admin"
              ? "cancelled-by-admin"
              : "cancelled-by-host",
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
      acceptedAt: true,
      depositPolicySnapshot: true,
      advancePaymentAmount: true,
      damageDepositAmount: true,
      paymentStatus: true,
      advancePaymentStatus: true,
      damageDepositStatus: true,
      selectedPaymentMethod: true,
      paymentMethodsSnapshot: true,
      guest: { select: { name: true } },
      listing: {
        select: {
          id: true,
          acceptedPaymentMethods: true,
          paymentInstructionTemplates: true,
        },
      },
      paymentRequests: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          amount: true,
          currency: true,
          dueAt: true,
          status: true,
        },
      },
    },
  });
  if (!booking) throw new Error("Booking not found");
  const snapshot = parsePaymentMethodsSnapshot(booking.paymentMethodsSnapshot);
  const guestChosenMethod = isPaymentMethodCode(booking.selectedPaymentMethod)
    ? booking.selectedPaymentMethod
    : snapshot?.status === "REVIEWED" && snapshot.methods.length === 1
      ? snapshot.methods[0]
      : null;
  const store = parsePaymentInstructionStore(
    booking.listing.paymentInstructionTemplates,
  );

  /**
   * What this booking may still be paid by.
   *
   * The frozen snapshot is the authority: it is the list the guest actually saw. Only a
   * booking with no usable snapshot — one taken before the snapshot existed — falls back
   * to the listing's current answer, and even then the host must choose explicitly.
   */
  const availableMethods =
    snapshot?.status === "REVIEWED" && snapshot.methods.length > 0
      ? snapshot.methods
      : booking.listing.acceptedPaymentMethods.filter(isPaymentMethodCode);

  const resolved = guestChosenMethod
    ? resolvePaymentInstructionsForMethod(store, guestChosenMethod)
    : ({ kind: "NONE" } as const);
  const calculatedObligations = bookingPaymentObligations({
    total: Number(booking.totalPrice),
    advancePaymentAmount: Number(booking.advancePaymentAmount ?? 0),
    damageDepositAmount: Number(booking.damageDepositAmount ?? 0),
    depositPolicySnapshot: booking.depositPolicySnapshot,
    acceptedAt: booking.acceptedAt ?? new Date(),
    checkIn: booking.checkIn,
  });
  const requests =
    booking.paymentRequests.length > 0
      ? booking.paymentRequests.map((request) => ({
          id: request.id,
          type: request.type,
          amount: Number(request.amount),
          currency: request.currency,
          dueDate: dbDateToYmd(request.dueAt),
          status: request.status,
        }))
      : calculatedObligations.map((request) => ({
          id: null,
          ...request,
          currency: booking.currency,
          status: "DRAFT" as const,
        }));

  /**
   * What accepting would actually put on the guest: a request above zero, on a track
   * acceptance leaves open. A zero-value stay, a waived price and an already-settled
   * deposit all count as nothing to collect, which is what makes "no instructions
   * needed" a true answer rather than a way to skip the question.
   */
  const frozenDepositPolicies = parseDepositPoliciesSnapshot(
    booking.depositPolicySnapshot,
  );
  const stateAfterAcceptance = paymentStateAfterAcceptance({
    paymentStatus: booking.paymentStatus,
    advancePaymentStatus: booking.advancePaymentStatus,
    damageDepositStatus: booking.damageDepositStatus,
    advancePaymentAmount: booking.advancePaymentAmount,
    damageDepositAmount: booking.damageDepositAmount,
    advanceDueAfterAcceptance:
      frozenDepositPolicies?.advancePayment?.dueTiming === "AFTER_ACCEPTANCE",
    damageDueAfterAcceptance:
      frozenDepositPolicies?.damageDeposit?.dueTiming === "AFTER_ACCEPTANCE",
  });
  const payableRequests = requests.filter(
    (request) =>
      request.status === "DRAFT" &&
      request.amount > 0 &&
      obligationTrackIsOpen(request.type, stateAfterAcceptance),
  );
  // Computed from the guest's own choice, which is what the host's screen shows. The
  // acceptance workflow recomputes it against the method it actually resolves, so a
  // booking with no recorded choice cannot be accepted "no instructions needed" while
  // the host quietly supplies a bank transfer.
  const decisionRule = acceptanceDecisionRule({
    method: guestChosenMethod,
    payableCount: payableRequests.length,
    availableMethods,
  });

  return {
    bookingId: booking.id,
    status: booking.status,
    listingId: booking.listing.id,
    reference: booking.reference,
    guestName: booking.guest.name,
    currency: booking.currency,
    total: Number(booking.totalPrice),
    requests,
    checkIn: booking.checkIn.toISOString().slice(0, 10),
    selectedPaymentMethod: guestChosenMethod,
    /**
     * Whether the method above came from the guest or still has to be chosen. A guest's
     * choice is never replaced; this only distinguishes "the guest picked this" from
     * "this booking predates the choice and the host must pick one".
     */
    methodSource: guestChosenMethod ? ("GUEST" as const) : ("HOST_FALLBACK" as const),
    availableMethods,
    otherLabel: snapshot?.otherLabel ?? null,
    /** Legacy V1 free text for the chosen method, if that is what the host has saved. */
    savedInstructions: resolved.kind === "LEGACY_TEXT" ? resolved.text : "",
    savedDetailsKind: resolved.kind,
    savedDetailFields:
      resolved.kind === "STRUCTURED"
        ? resolved.details.fields
        : ({} as PaymentDetailFieldValues),
    /** How many obligations acceptance would open. Zero means nothing to collect. */
    payableRequestCount: payableRequests.length,
    /** The decisions a host may accept this booking with, and the one a UI may
     *  preselect. Advisory for rendering; the service revalidates on submit. */
    decisionRule,
  };
}

/**
 * The prefill for a host's payment-request form on one booking.
 *
 * Ownership is part of the query, so another host's booking is indistinguishable from a
 * missing one, and the result carries the saved details for this booking's method only —
 * never the host's other templates, and never anything a guest-facing page could reuse.
 */
export async function getBookingPaymentRequestPrefill(
  bookingId: string,
  hostId: string,
): Promise<BookingPaymentRequestPrefill | null> {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, listing: { hostId } },
    select: {
      selectedPaymentMethod: true,
      paymentMethodsSnapshot: true,
      listing: {
        select: { acceptedPaymentMethods: true, paymentInstructionTemplates: true },
      },
    },
  });
  if (!booking) return null;

  const snapshot = parsePaymentMethodsSnapshot(booking.paymentMethodsSnapshot);
  const method = isPaymentMethodCode(booking.selectedPaymentMethod)
    ? booking.selectedPaymentMethod
    : null;
  const availableMethods =
    snapshot?.status === "REVIEWED" && snapshot.methods.length > 0
      ? snapshot.methods
      : booking.listing.acceptedPaymentMethods.filter(isPaymentMethodCode);
  const resolved = method
    ? resolvePaymentInstructionsForMethod(
        parsePaymentInstructionStore(booking.listing.paymentInstructionTemplates),
        method,
      )
    : ({ kind: "NONE" } as const);

  return {
    method,
    methodSource: method ? "GUEST" : "HOST_FALLBACK",
    availableMethods,
    otherLabel: snapshot?.otherLabel ?? null,
    savedDetailsKind: resolved.kind,
    savedDetailFields: resolved.kind === "STRUCTURED" ? resolved.details.fields : {},
    savedInstructions: resolved.kind === "LEGACY_TEXT" ? resolved.text : "",
  };
}

/**
 * Saves what the host just sent as the reusable template for that one method.
 *
 * Only ever reached when the host ticks "save for future bookings". Every other method's
 * saved data — legacy text and structured fields alike — is read, kept, and written back
 * untouched, so saving one booking's PayPal details can never disturb a bank transfer.
 */
export async function saveBookingPaymentInstructionTemplate(input: {
  bookingId: string;
  hostId: string;
  method: PaymentMethodCode;
  body?: string;
  fields?: PaymentDetailFieldValues;
}) {
  const booking = await db.booking.findFirst({
    where: { id: input.bookingId, listing: { hostId: input.hostId } },
    select: {
      selectedPaymentMethod: true,
      paymentMethodsSnapshot: true,
      listing: {
        select: {
          id: true,
          acceptedPaymentMethods: true,
          paymentInstructionTemplates: true,
        },
      },
    },
  });
  if (!booking) throw new Error("Booking not found");
  // A recorded guest choice is the only method this booking may write back.
  if (
    booking.selectedPaymentMethod !== null &&
    booking.selectedPaymentMethod !== input.method
  ) {
    throw new Error("Booking not found");
  }
  if (booking.selectedPaymentMethod === null) {
    const snapshot = parsePaymentMethodsSnapshot(booking.paymentMethodsSnapshot);
    const allowed =
      snapshot?.status === "REVIEWED" && snapshot.methods.length > 0
        ? snapshot.methods
        : booking.listing.acceptedPaymentMethods.filter(isPaymentMethodCode);
    if (!allowed.includes(input.method)) throw new Error("Booking not found");
  }

  const current = parsePaymentInstructionStore(
    booking.listing.paymentInstructionTemplates,
  );

  if (input.fields) {
    if (!methodSupportsPaymentDetails(input.method)) {
      throw new Error("Payment instructions could not be saved");
    }
    const details = validatePaymentMethodDetailsMap(
      { ...current.details, [input.method]: { fields: input.fields } },
      booking.listing.acceptedPaymentMethods.filter(isPaymentMethodCode),
      current.details,
    );
    if (!details.success) throw new Error("Payment instructions could not be saved");
    await db.listing.update({
      where: { id: booking.listing.id },
      data: {
        paymentInstructionTemplates: paymentInstructionStoreSnapshot({
          // Structured details supersede this method's legacy paragraph, and only this
          // method's: the host reviewed and sent these exact fields, which is the
          // deliberate act that retires the old text.
          templates: { ...current.templates, [input.method]: "" },
          details: details.value,
        }) as unknown as Prisma.InputJsonObject,
      },
    });
    return;
  }

  const next = { ...current.templates, [input.method]: (input.body ?? "").trim() };
  const validated = validatePaymentInstructionTemplates(
    next,
    booking.listing.acceptedPaymentMethods,
  );
  if (!validated.success) throw new Error("Payment instructions could not be saved");

  await db.listing.update({
    where: { id: booking.listing.id },
    data: {
      paymentInstructionTemplates: paymentInstructionStoreSnapshot({
        templates: validated.value,
        details: current.details,
      }) as unknown as Prisma.InputJsonObject,
    },
  });
}

/**
 * Writes the acceptance. The only place a booking becomes CONFIRMED.
 *
 * `decision` is required and is not defaulted anywhere: this used to fall back to a
 * status derived from `selectedPaymentMethod`, so a host who accepted on the phone got
 * a `PENDING` instructions task they had never been asked about, while the same
 * booking accepted on the web got whatever the dialog had made them choose (M1).
 *
 * The decision is re-validated here, inside the transaction, against the booking as it
 * stands right now — the guest's recorded method and the money this acceptance would
 * actually open. `acceptBookingAsHost` is the workflow every host path goes through and
 * checks more than this (a host-supplied method for a booking with no recorded choice,
 * the details being sent); this is the floor beneath it, so no caller — a future route,
 * a script, a test — can write an acceptance whose payment state contradicts itself.
 */
export async function confirmBooking(
  bookingId: string,
  hostId: string,
  options: {
    decision: BookingPaymentDecision;
    /** Only consulted when the guest did not record a choice. */
    method?: PaymentMethodCode;
  },
) {
  const result = await db.$transaction(async (tx) => {
    const bookingListing = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { listingId: true },
    });
    if (!bookingListing) throw new Error("Booking not found");

    // Acceptance is part of the same per-listing lifecycle as booking creation,
    // unpublishing, archiving and suspension. Once the lock is ours, re-read both the
    // booking and listing in this transaction: the screen's earlier payment DTO and
    // even the lookup above may be stale by the time this writer gets its turn.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bookingListing.listingId}))`;

    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { listing: true },
    });

    if (!booking) throw new Error("Booking not found");
    if (booking.listing.hostId !== hostId) {
      throw new Error("You can only confirm bookings for your own listings");
    }
    if (booking.listing.status !== ListingStatus.APPROVED) {
      throw new Error(
        "This listing is no longer approved, so this booking request cannot be accepted",
      );
    }
    if (booking.status !== BookingStatus.PENDING) {
      throw new Error("Only pending bookings can be confirmed");
    }

    // Capture the decision time after the advisory-lock wait and the authoritative
    // re-read. A timestamp taken before either could let a host through after the
    // response deadline or the frozen check-in cutoff passed while this call waited.
    const now = new Date();

    // The window closes at the stored deadline *or* at the stay's own arrival instant,
    // whichever came first. The second half is what stops a host confirming a guest into
    // a stay that has already begun — a state `cancelBooking` then refuses to let that
    // guest out of, so they would never have had a moment in which self-service
    // cancellation existed. Rows created before the deadline was clamped still carry an
    // unclamped `responseDueAt`, and the cutoff catches them without a backfill.
    if (!bookingResponseWindowIsOpen(booking, now)) {
      const expired = await tx.booking.updateMany({
        // Guarded on status alone: for a legacy row the stored deadline has *not*
        // passed, so repeating it here would match nothing and report a phantom
        // concurrent change. PENDING is the invariant this compare-and-set protects.
        where: {
          id: bookingId,
          status: BookingStatus.PENDING,
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
      // The host arrived too late, so what happened here is an expiry — recorded as
      // one even though this call is about to fail. That transition committed; only
      // the acceptance or the decline did not.
      await recordBookingTimelineEvent(tx, {
        bookingId,
        type: "EXPIRED",
        actor: { role: "SYSTEM" },
      });
      return { outcome: "expired" as const, bookingId };
    }

    const frozenDepositPolicies = parseDepositPoliciesSnapshot(
      booking.depositPolicySnapshot,
    );
    // Accepting a request opens the money tracks the policy asked for — but only the
    // ones that are actually asking for money.
    //
    // The policy *object* is not that question. A percentage policy on a small total,
    // or a fixed one the host set to zero, resolves to an amount of zero, and creation
    // settles that track as NOT_REQUIRED — a real answer, and the one the guest was
    // shown at request time. Keying acceptance off the object alone re-opened those
    // settled tracks as AWAITING_PAYMENT/AWAITING_DEPOSIT, asking the guest for money
    // the booking had already told them was not owed.
    //
    // So the frozen amount decides first, and an already-settled track stays settled.
    // The amount is the figure frozen at creation from the same policy, so this cannot
    // disagree with what the guest agreed to.
    const acceptedPaymentState = paymentStateAfterAcceptance({
      paymentStatus: booking.paymentStatus,
      advancePaymentStatus: booking.advancePaymentStatus,
      damageDepositStatus: booking.damageDepositStatus,
      advancePaymentAmount: booking.advancePaymentAmount,
      damageDepositAmount: booking.damageDepositAmount,
      advanceDueAfterAcceptance:
        frozenDepositPolicies?.advancePayment?.dueTiming === "AFTER_ACCEPTANCE",
      damageDueAfterAcceptance:
        frozenDepositPolicies?.damageDeposit?.dueTiming === "AFTER_ACCEPTANCE",
    });
    const obligations = bookingPaymentObligations({
      total: Number(booking.totalPrice),
      advancePaymentAmount: Number(booking.advancePaymentAmount ?? 0),
      damageDepositAmount: Number(booking.damageDepositAmount ?? 0),
      depositPolicySnapshot: booking.depositPolicySnapshot,
      acceptedAt: now,
      checkIn: booking.checkIn,
    }).filter((obligation) =>
      obligationTrackIsOpen(obligation.type, acceptedPaymentState),
    );
    const paymentSnapshot = parsePaymentMethodsSnapshot(
      booking.paymentMethodsSnapshot,
    );
    const availableMethods =
      paymentSnapshot?.status === "REVIEWED" && paymentSnapshot.methods.length > 0
        ? paymentSnapshot.methods
        : booking.listing.acceptedPaymentMethods.filter(isPaymentMethodCode);
    const effectiveMethod = resolveRequestMethod(
      {
        selectedPaymentMethod: isPaymentMethodCode(booking.selectedPaymentMethod)
          ? booking.selectedPaymentMethod
          : null,
        availableMethods,
      },
      options.method,
    );
    if (
      !isPaymentMethodCode(booking.selectedPaymentMethod) &&
      options.method &&
      !effectiveMethod
    ) {
      throw new Error("That payment method is not valid for this booking.");
    }
    const decisionError = acceptanceDecisionError(
      options.decision,
      acceptanceDecisionRule({
        method: effectiveMethod,
        payableCount: obligations.length,
        availableMethods,
      }),
    );
    if (decisionError) throw new Error(decisionError);
    const paymentInstructionsStatus = instructionsStatusForDecision(options.decision);

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
        // Persist an allowed host fallback so later payment requests and reminders do
        // not have to rediscover the method chosen during acceptance.
        selectedPaymentMethod: effectiveMethod,
        paymentStatus: acceptedPaymentState.paymentStatus,
        paymentInstructionsStatus,
        paymentStatusUpdatedAt: now,
        advancePaymentStatus: acceptedPaymentState.advancePaymentStatus,
        damageDepositStatus: acceptedPaymentState.damageDepositStatus,
        advancePaymentStatusUpdatedAt:
          acceptedPaymentState.advancePaymentStatus === "AWAITING_PAYMENT" ? now : null,
        damageDepositStatusUpdatedAt:
          acceptedPaymentState.damageDepositStatus === "AWAITING_DEPOSIT" ? now : null,
      },
    });
    if (confirmed.count === 0) {
      throw new Error("This booking request changed while you were responding");
    }
    await recordBookingTimelineEvent(tx, {
      bookingId,
      type: "CONFIRMED",
      actor: { role: "HOST", userId: hostId },
    });
    if (obligations.length > 0) {
      await tx.bookingPaymentRequest.createMany({
        data: obligations.map((obligation) => ({
          bookingId,
          type: obligation.type,
          amount: obligation.amount,
          currency: booking.currency,
          dueAt: ymdToDbDate(obligation.dueDate),
          method: effectiveMethod,
          otherLabel: paymentSnapshot?.otherLabel ?? null,
          // Cash-at-property and arrange-directly still need an active, dated
          // obligation for progress and reminders, but there are no private bank
          // details for the host to review or send. Mark that decision explicitly so
          // the booking does not immediately create a false "send instructions" task.
          ...(paymentInstructionsStatus === "NOT_NEEDED"
            ? {
                status: "SENT" as const,
                instructionsSnapshot: {
                  version: 1,
                  kind: "NO_INSTRUCTIONS",
                } as Prisma.InputJsonObject,
                reviewedAt: now,
                sentAt: now,
              }
            : {}),
        })),
        skipDuplicates: true,
      });
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

    // The database read can wait. Measure the response at the point the current row is
    // actually in hand, rather than at function entry with a potentially stale clock.
    const now = new Date();

    // The window closes at the stored deadline *or* at the stay's own arrival instant,
    // whichever came first. The second half is what stops a host confirming a guest into
    // a stay that has already begun — a state `cancelBooking` then refuses to let that
    // guest out of, so they would never have had a moment in which self-service
    // cancellation existed. Rows created before the deadline was clamped still carry an
    // unclamped `responseDueAt`, and the cutoff catches them without a backfill.
    if (!bookingResponseWindowIsOpen(booking, now)) {
      const expired = await tx.booking.updateMany({
        // Guarded on status alone: for a legacy row the stored deadline has *not*
        // passed, so repeating it here would match nothing and report a phantom
        // concurrent change. PENDING is the invariant this compare-and-set protects.
        where: {
          id: bookingId,
          status: BookingStatus.PENDING,
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
      // The host arrived too late, so what happened here is an expiry — recorded as
      // one even though this call is about to fail. That transition committed; only
      // the acceptance or the decline did not.
      await recordBookingTimelineEvent(tx, {
        bookingId,
        type: "EXPIRED",
        actor: { role: "SYSTEM" },
      });
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
    await recordBookingTimelineEvent(tx, {
      bookingId,
      type: "REJECTED",
      actor: { role: "HOST", userId: hostId },
    });

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

/**
 * When a stay's review window opens, and when it closes.
 *
 * One module, because six places used to need this answer and only two of them agreed:
 * completion decided a stay was over at the *start* of the checkout calendar day, while
 * the deadline was measured from an assumed 10:00 **UTC** on that same day. So the
 * window opened up to twelve hours before the guest had actually left, and the fourteen
 * days it advertised were counted from a different moment than the one that opened it
 * (L7). Everything that has an opinion about the window now asks here.
 *
 * Deliberately free of Prisma and of `server-only`: it takes the two facts it needs —
 * the stored checkout date and the booking's frozen house-rules snapshot — so the rule
 * can be read directly by a test, and so no caller can be tempted to re-derive it.
 */
import {
  dbDateToYmd,
  isValidHhmm,
  zonedTimeToInstant,
} from "@/lib/utils/date-only";
import { parseHouseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";

/** The window a completed stay grants each side, in whole days. */
export const REVIEW_WINDOW_DAYS = 14;

/**
 * The checkout time used when the booking does not carry one of its own.
 *
 * Three populations land here and all three mean the same thing: bookings taken before
 * `houseRulesSnapshot` existed, bookings whose host never committed to a time
 * (`FLEXIBLE_STAY_TIME`, stored as null), and rows whose stored value is not a
 * wall-clock time at all. 10:00 is the marketplace's standard checkout — the number the
 * previous implementation already assumed, now read in the marketplace's own zone
 * rather than in UTC.
 */
export const DEFAULT_CHECKOUT_TIME = "10:00";

/** Just the fields the window depends on. Any `select` may hand more. */
export interface ReviewWindowBooking {
  checkOut: Date | string;
  houseRulesSnapshot?: unknown;
}

/**
 * The checkout wall time this booking agreed to, as "HH:MM".
 *
 * Read from the *frozen* snapshot, never from the listing: a host who moves checkout to
 * 14:00 next season must not move a past guest's review window with it.
 */
export function checkoutTimeForBooking(booking: ReviewWindowBooking): string {
  const snapshot = parseHouseRulesSnapshot(booking.houseRulesSnapshot);
  const stored = snapshot?.checkOutTime;
  return isValidHhmm(stored) ? stored : DEFAULT_CHECKOUT_TIME;
}

/**
 * The instant the stay ends — which is the instant the stay completes and the instant
 * the review window opens. Not midnight, and not the following day.
 */
export function reviewWindowOpensAt(booking: ReviewWindowBooking): Date {
  return zonedTimeToInstant(
    dbDateToYmd(booking.checkOut),
    checkoutTimeForBooking(booking),
  );
}

/** Fourteen full days after the window opened, to the minute. */
export function reviewWindowDeadline(opensAt: Date): Date {
  return new Date(opensAt.getTime() + REVIEW_WINDOW_DAYS * 86_400_000);
}

/** Both ends of the window, for callers that need them together. */
export function reviewWindowForBooking(booking: ReviewWindowBooking): {
  opensAt: Date;
  deadline: Date;
} {
  const opensAt = reviewWindowOpensAt(booking);
  return { opensAt, deadline: reviewWindowDeadline(opensAt) };
}

/** Whether the stay is over as of `now` — the single completion test. */
export function stayHasEnded(booking: ReviewWindowBooking, now: Date): boolean {
  return reviewWindowOpensAt(booking).getTime() <= now.getTime();
}

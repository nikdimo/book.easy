/**
 * How long a host has to answer a booking request, and the instant that window can
 * never outlast: the moment the stay itself begins.
 *
 * Deliberately modelled on `review-window.ts`, and for the same reason. Three places
 * used to have an opinion about the answer deadline and none of them mentioned the
 * stay: `createBooking` set `responseDueAt = createdAt + 24h` unconditionally,
 * `confirmBooking` checked only that deadline, and the expiry sweep followed the
 * column. A request made at 23:00 for a stay starting that same day therefore stayed
 * acceptable until 23:00 the *next* day — so a host could confirm a guest into a stay
 * already underway, and `cancelBooking` would then refuse that guest's own
 * cancellation because `checkIn <= today`. They never had a moment in which
 * self-service cancellation existed.
 *
 * Same-day booking stays available. What is bounded is the answer: the request dies
 * when the stay starts, because after that there is nothing left to accept.
 *
 * Free of Prisma and of `server-only` on purpose: it takes the two facts it needs — the
 * stored check-in date and the booking's frozen house-rules snapshot — so the rule can
 * be read directly by a test and no caller has to re-derive it.
 */
import {
  dbDateToYmd,
  isValidHhmm,
  zonedTimeToInstant,
} from "@/lib/utils/date-only";
import { parseHouseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";

/** How long a host gets to answer, when the stay is far enough away to allow it. */
export const BOOKING_RESPONSE_WINDOW_HOURS = 24;

/**
 * The check-in time used when the booking does not carry one of its own.
 *
 * The same three populations `DEFAULT_CHECKOUT_TIME` covers: bookings taken before
 * `houseRulesSnapshot` existed, bookings from a guest who never accepted the rules (the
 * snapshot is only written alongside `houseRulesAcceptedAt`), hosts who left arrival
 * flexible (`FLEXIBLE_STAY_TIME`, stored as null), and rows whose stored value is not a
 * wall-clock time at all. 15:00 is the product's own default arrival time — the number
 * `defaultHouseRules` already uses.
 */
export const DEFAULT_CHECK_IN_TIME = "15:00";

/** Just the fields the window depends on. Any `select` may hand more. */
export interface ResponseWindowBooking {
  checkIn: Date | string;
  houseRulesSnapshot?: unknown;
}

/**
 * The arrival wall time this booking agreed to, as "HH:MM".
 *
 * Read from the *frozen* snapshot, never from the listing: a host who moves arrival to
 * 18:00 next season must not extend a pending request that was taken under 15:00.
 */
export function checkInTimeForBooking(booking: ResponseWindowBooking): string {
  const snapshot = parseHouseRulesSnapshot(booking.houseRulesSnapshot);
  const stored = snapshot?.checkInTime;
  return isValidHhmm(stored) ? stored : DEFAULT_CHECK_IN_TIME;
}

/**
 * The instant a pending request stops being answerable — the instant the stay begins.
 *
 * Read in the marketplace zone, like every other wall-clock rule here, so a UTC server
 * does not close the window two hours early or late.
 */
export function bookingAcceptanceCutoff(booking: ResponseWindowBooking): Date {
  return zonedTimeToInstant(
    dbDateToYmd(booking.checkIn),
    checkInTimeForBooking(booking),
  );
}

/**
 * The deadline a new request is created with: the ordinary window, or the start of the
 * stay, whichever comes first.
 *
 * Never later than the cutoff, so the stored column alone remains the whole truth for
 * the expiry sweep — `expirePendingBookings` needs no second rule to stay correct.
 */
export function bookingResponseDueAt(
  booking: ResponseWindowBooking & { createdAt: Date },
): Date {
  const ordinary =
    booking.createdAt.getTime() + BOOKING_RESPONSE_WINDOW_HOURS * 3_600_000;
  const cutoff = bookingAcceptanceCutoff(booking).getTime();
  return new Date(Math.min(ordinary, cutoff));
}

/**
 * Whether a request can still be answered at `now`.
 *
 * The one test `confirmBooking` and `declineBooking` share. Written against the cutoff
 * as well as the stored deadline so that a *legacy* row — created before the deadline
 * was clamped, and therefore carrying an unclamped `responseDueAt` — is refused too,
 * without a migration having to rewrite it.
 */
export function bookingResponseWindowIsOpen(
  booking: ResponseWindowBooking & { responseDueAt: Date },
  now: Date,
): boolean {
  return (
    booking.responseDueAt.getTime() > now.getTime() &&
    bookingAcceptanceCutoff(booking).getTime() > now.getTime()
  );
}

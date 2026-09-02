import {
  addDaysToYmd,
  compareYmd,
  isValidYmd,
  nightsBetweenYmd,
} from "@/lib/utils/date-only";

/**
 * Fixed stays — the rules a stored period has to obey, and nothing else.
 *
 * A fixed stay is an exact check-in and checkout pair the host offers as a whole: the
 * guest takes those dates or they take another option. This module owns the four
 * questions that decide whether such a pair may exist — is it a real forward range, is
 * it one of the lengths the product sells, does the listing already offer exactly it,
 * and which other periods does it share nights with — and deliberately owns nothing
 * else.
 *
 * In particular it does not own:
 *
 * - **Price.** A period contributes two dates to the listing's existing quote engine
 *   and no money of its own. There is no package price, and the nightly rate, date
 *   overrides, cleaning fee, promotions and taxes apply exactly as they do to a
 *   flexible stay.
 * - **Occupancy.** Whether the nights are free is answered by the listing's blocks —
 *   bookings, holds, manual blocks and imported calendars — the same authoritative
 *   source every other availability question uses. A period carries no booked flag.
 * - **Length.** Nights are `checkOut - checkIn`, derived here and stored nowhere, so
 *   the stored dates and the advertised length cannot drift apart.
 *
 * Dates are `YYYY-MM-DD` throughout and are only ever compared and moved with the
 * repository's date-only helpers, so nothing here can slide a day across a time zone or
 * daylight-saving boundary.
 */

/** The two lengths a fixed stay may be. Adjacent periods never combine into a third. */
export const FIXED_STAY_NIGHTS = [7, 14] as const;

export type FixedStayNights = (typeof FIXED_STAY_NIGHTS)[number];

/** A stay the host offers, in the shape the rules need: two calendar dates. */
export interface FixedStayPeriodRange {
  /** `YYYY-MM-DD`. */
  checkIn: string;
  /** `YYYY-MM-DD`, exclusive — the day the guest leaves, never an occupied night. */
  checkOut: string;
}

/** Checkout is never typed by a host — it is the check-in plus the chosen length. */
export function checkOutForFixedStay(
  checkIn: string,
  nights: FixedStayNights,
): string {
  return addDaysToYmd(checkIn, nights);
}

/** The length of a period, derived from its dates every time it is asked for. */
export function fixedStayNights(period: FixedStayPeriodRange): number {
  return nightsBetweenYmd(period.checkIn, period.checkOut);
}

/** Whether a length is one the product sells as a fixed stay. */
export function isFixedStayNights(nights: number): nights is FixedStayNights {
  return (FIXED_STAY_NIGHTS as readonly number[]).includes(nights);
}

export type FixedStayPeriodIssue =
  /** One of the two dates is not a calendar date in `YYYY-MM-DD`. */
  | "INVALID_DATE"
  /** Checkout falls on or before check-in, so the stay covers no night at all. */
  | "NOT_FORWARD"
  /** A real forward range, but not 7 or 14 nights. */
  | "UNSUPPORTED_LENGTH";

export type FixedStayPeriodValidation =
  | { ok: true; nights: FixedStayNights }
  | { ok: false; issue: FixedStayPeriodIssue };

/**
 * Whether a pair of dates is a fixed stay this product can store.
 *
 * Ordered so the caller is told the one thing actually wrong, cheapest question first:
 * a malformed date before a reversed range, a reversed range before its length — because
 * "that is 0 nights" is a less useful sentence than "checkout is before check-in".
 *
 * The forward check is not made redundant by the length check. It is the floor the
 * database's own `checkIn < checkOut` constraint sits on, and it is what a caller
 * validating host input reports rather than letting the write fail on the constraint.
 */
export function validateFixedStayPeriod(
  period: FixedStayPeriodRange,
): FixedStayPeriodValidation {
  if (!isValidYmd(period.checkIn) || !isValidYmd(period.checkOut)) {
    return { ok: false, issue: "INVALID_DATE" };
  }
  if (compareYmd(period.checkOut, period.checkIn) <= 0) {
    return { ok: false, issue: "NOT_FORWARD" };
  }

  const nights = fixedStayNights(period);
  if (!isFixedStayNights(nights)) {
    return { ok: false, issue: "UNSUPPORTED_LENGTH" };
  }
  return { ok: true, nights };
}

export function isValidFixedStayPeriod(period: FixedStayPeriodRange): boolean {
  return validateFixedStayPeriod(period).ok;
}

/**
 * The identity of a period: its two dates, and nothing else.
 *
 * The same key the stored unique index enforces (`listingId, checkIn, checkOut`), minus
 * the listing, which every caller has already narrowed to. Two periods whose keys are
 * equal are the same offer, whatever else differs about the rows.
 */
export function fixedStayPeriodKey(period: FixedStayPeriodRange): string {
  return `${period.checkIn}/${period.checkOut}`;
}

/** Whether two periods are the same offer. */
export function isSameFixedStayPeriod(
  left: FixedStayPeriodRange,
  right: FixedStayPeriodRange,
): boolean {
  return left.checkIn === right.checkIn && left.checkOut === right.checkOut;
}

/**
 * The existing period a candidate would duplicate, if there is one.
 *
 * Sharing a check-in is not duplication — a week and a fortnight from the same Saturday
 * are two real options, and refusing the second would refuse the product. Only both
 * dates matching is a duplicate, because that is the one pair a guest could not tell
 * apart, and it is exactly what the unique index refuses.
 *
 * `ignoreId` is the row being edited: a period is never its own duplicate.
 */
export function findDuplicateFixedStay<
  T extends FixedStayPeriodRange & { id: string },
>(
  candidate: FixedStayPeriodRange,
  existing: readonly T[],
  ignoreId?: string,
): T | null {
  return (
    existing.find(
      (period) =>
        period.id !== ignoreId && isSameFixedStayPeriod(period, candidate),
    ) ?? null
  );
}

/**
 * Nights are `[checkIn, checkOut)`, so back-to-back stays share a date without sharing a
 * night: a stay ending on the 8th and one starting on the 8th do not overlap.
 */
export function fixedStaysOverlap(
  left: FixedStayPeriodRange,
  right: FixedStayPeriodRange,
): boolean {
  return (
    compareYmd(left.checkIn, right.checkOut) < 0 &&
    compareYmd(right.checkIn, left.checkOut) < 0
  );
}

/**
 * Every existing period a candidate shares nights with.
 *
 * Informational, never a refusal. Overlapping alternatives are how a host says "one week
 * or two from the 1st", and whichever the guest books withdraws the other through the
 * ordinary block rules — so the host is the one who decides whether two overlapping
 * options is what they meant. An exact duplicate is excluded here because it is a
 * different answer with a different consequence.
 */
export function overlappingFixedStays<
  T extends FixedStayPeriodRange & { id: string },
>(
  candidate: FixedStayPeriodRange,
  existing: readonly T[],
  ignoreId?: string,
): T[] {
  return existing.filter(
    (period) =>
      period.id !== ignoreId &&
      !isSameFixedStayPeriod(period, candidate) &&
      fixedStaysOverlap(period, candidate),
  );
}

/**
 * Chronological, then shortest first, so two options from one date read as a ladder.
 *
 * Total and deterministic: `YYYY-MM-DD` compares as calendar order, and the two keys
 * together are unique within a listing, so there is no tie left for the sort to break
 * arbitrarily.
 */
export function sortFixedStayPeriods<T extends FixedStayPeriodRange>(
  periods: readonly T[],
): T[] {
  return [...periods].sort(
    (left, right) =>
      compareYmd(left.checkIn, right.checkIn) ||
      compareYmd(left.checkOut, right.checkOut),
  );
}

/**
 * What a booking freezes about the period it was sold as.
 *
 * The relation on `Booking` is `onDelete: SetNull`, so a host deleting a period must not
 * take the record of what the guest booked with it. `version` is written from the first
 * row so a later shape change can be read forwards rather than guessed at.
 */
export const FIXED_STAY_SNAPSHOT_VERSION = 1;

export interface FixedStaySnapshot {
  version: number;
  periodId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
}

export function buildFixedStaySnapshot(
  period: FixedStayPeriodRange & { id: string },
): FixedStaySnapshot {
  return {
    version: FIXED_STAY_SNAPSHOT_VERSION,
    periodId: period.id,
    checkIn: period.checkIn,
    checkOut: period.checkOut,
    nights: fixedStayNights(period),
  };
}

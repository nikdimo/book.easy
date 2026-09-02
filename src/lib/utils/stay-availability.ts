import { windowsCoverStay } from "@/lib/utils/availability-windows";
import { compareYmd, isValidYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  isSameFixedStayPeriod,
  type FixedStayPeriodRange,
} from "@/lib/utils/fixed-stay-periods";

/**
 * The one rule that decides whether a listing *offers* a pair of dates at all.
 *
 * Two booking modes, one question. A FLEXIBLE listing offers whatever its availability
 * windows cover, exactly as it does today — this branch delegates to
 * `isStayWithinAvailabilityWindows`' own rule rather than restating it, so nothing about
 * an existing listing can change here. A FIXED_STAYS listing offers only the exact stays
 * its host has put on sale.
 *
 * What this deliberately does **not** answer:
 *
 * - **Is anyone already in those nights.** Bookings, holds, manual blocks and imported
 *   calendar blocks stay where they are, in `AvailabilityBlock`, and remain the
 *   authoritative negative answer. A stay this function calls offered may still be
 *   unbookable because someone took it, including through an overlapping fixed stay.
 * - **Is it long enough.** Minimum and maximum night rules are a flexible-calendar
 *   concept: a fixed stay's length was chosen by the host when they created it, and
 *   re-testing it against a minimum the host set for a different way of selling would
 *   refuse stays the host is deliberately offering. See `stayLengthRulesApply`.
 * - **What it costs.** Identical in both modes.
 *
 * Dates cross this boundary as `YYYY-MM-DD`, not as `Date`. Every question here is a
 * calendar-date question — is this the same day, has this day gone by — and a `Date` read
 * against the wrong zone answers them a day out. Callers holding `@db.Date` values
 * convert with `dbDateToYmd`, which is the conversion the rest of the date-only code
 * already goes through.
 *
 * This is the shared rule, and it has three callers: `createBooking`, which decides
 * whether a request may become a booking; `checkAvailability`, which every other "is it
 * free?" read goes through; and the search filter, which expresses the same two branches
 * in SQL rather than calling in — see `buildListingWhere`. They agree because they are
 * the same rule, not because three implementations happen to line up.
 */

/** The two ways a listing can sell its dates, as `Listing.bookingMode` stores them. */
export const BOOKING_MODE_FLEXIBLE = "FLEXIBLE";
export const BOOKING_MODE_FIXED_STAYS = "FIXED_STAYS";

/**
 * A period as this rule needs it: the two dates, its id, and whether the host has
 * switched it off. `disabledAt` is the column itself — non-null means switched off.
 */
export interface StayFixedStayPeriod extends FixedStayPeriodRange {
  id: string;
  disabledAt: Date | null;
}

/** An open window in the half-open `[startDate, endDate)` convention, as `YYYY-MM-DD`. */
export interface StayAvailabilityWindowYmd {
  startDate: string;
  endDate: string;
}

export interface StayAvailabilityInput {
  /** `Listing.bookingMode`. Anything that is not FIXED_STAYS is treated as flexible. */
  bookingMode: string;
  /** `Listing.availabilityMode`. Only consulted in the flexible branch. */
  availabilityMode: string;
  /** The listing's open windows. Only consulted in the flexible branch. */
  windows: readonly StayAvailabilityWindowYmd[];
  /** The listing's fixed stays. Only consulted in the fixed-stay branch. */
  fixedStayPeriods: readonly StayFixedStayPeriod[];
  /** The stay being asked about, `[checkIn, checkOut)`. */
  checkIn: string;
  checkOut: string;
  /** Today as a marketplace calendar date — `todayYmd()`, never `new Date()`. */
  today: string;
}

export type StayNotOfferedReason =
  /** Not two calendar dates, or the stay does not run forwards. */
  | "INVALID_RANGE"
  /** FLEXIBLE: the host has not opened these dates. */
  | "OUTSIDE_AVAILABILITY_WINDOWS"
  /** FIXED_STAYS: the host offers no stay with exactly these two dates. */
  | "NO_MATCHING_FIXED_STAY"
  /** FIXED_STAYS: the matching stay exists but the host switched it off. */
  | "FIXED_STAY_DISABLED"
  /** FIXED_STAYS: the matching stay's check-in has already gone by. */
  | "FIXED_STAY_IN_PAST";

export type StayAvailabilityDecision =
  | {
      offered: true;
      /** The period the stay was matched to, or null on a flexible listing. */
      fixedStayPeriodId: string | null;
    }
  | { offered: false; reason: StayNotOfferedReason };

/** Whether a listing sells whole stays rather than arbitrary date ranges. */
export function isFixedStayBookingMode(bookingMode: string): boolean {
  return bookingMode === BOOKING_MODE_FIXED_STAYS;
}

/**
 * Whether the listing's minimum and maximum night settings apply to a stay.
 *
 * They do not on a fixed-stay listing. The host chose each stay's length when they put
 * it on sale, so a stored minimum — very often left over from when the listing sold
 * flexibly — would refuse an option the host is deliberately offering. The settings stay
 * stored and untouched, which is what makes switching back to FLEXIBLE restore exactly
 * the calendar the host had.
 */
export function stayLengthRulesApply(bookingMode: string): boolean {
  return !isFixedStayBookingMode(bookingMode);
}

/**
 * The fixed stay a pair of dates refers to, or null.
 *
 * Matching is exact on both dates. A stay one night shorter than an offered fortnight is
 * not a smaller version of it; it is not on sale. The unique index means at most one row
 * can match, so this cannot be ambiguous.
 */
export function findMatchingFixedStay<T extends FixedStayPeriodRange>(
  periods: readonly T[],
  stay: FixedStayPeriodRange,
): T | null {
  return periods.find((period) => isSameFixedStayPeriod(period, stay)) ?? null;
}

/**
 * Whether the listing offers these dates, and which fixed stay it offered them as.
 *
 * The reasons are ordered so the caller learns the most specific true thing: a stay that
 * matches nothing is told so, and a stay that matches a period the host switched off or
 * that has already begun is told which of those it is, rather than both being flattened
 * into "no such stay".
 */
export function decideStayAvailability(
  input: StayAvailabilityInput,
): StayAvailabilityDecision {
  if (!isValidYmd(input.checkIn) || !isValidYmd(input.checkOut)) {
    return { offered: false, reason: "INVALID_RANGE" };
  }
  if (compareYmd(input.checkOut, input.checkIn) <= 0) {
    return { offered: false, reason: "INVALID_RANGE" };
  }

  if (!isFixedStayBookingMode(input.bookingMode)) {
    // Unchanged behaviour, and unchanged code: OPEN listings sell every date unless
    // something blocks them, CLOSED listings only inside the union of their windows.
    if (input.availabilityMode !== "CLOSED") {
      return { offered: true, fixedStayPeriodId: null };
    }
    const covered = windowsCoverStay(
      input.windows.map((window) => ({
        startDate: ymdToDbDate(window.startDate),
        endDate: ymdToDbDate(window.endDate),
      })),
      ymdToDbDate(input.checkIn),
      ymdToDbDate(input.checkOut),
    );
    return covered
      ? { offered: true, fixedStayPeriodId: null }
      : { offered: false, reason: "OUTSIDE_AVAILABILITY_WINDOWS" };
  }

  const match = findMatchingFixedStay(input.fixedStayPeriods, {
    checkIn: input.checkIn,
    checkOut: input.checkOut,
  });
  if (!match) return { offered: false, reason: "NO_MATCHING_FIXED_STAY" };
  if (match.disabledAt !== null) {
    return { offered: false, reason: "FIXED_STAY_DISABLED" };
  }
  // A stay whose check-in has gone by is not one anybody can still take. Check-in rather
  // than checkout: a fortnight begun last week is in progress, not on sale.
  if (compareYmd(match.checkIn, input.today) < 0) {
    return { offered: false, reason: "FIXED_STAY_IN_PAST" };
  }

  return { offered: true, fixedStayPeriodId: match.id };
}

/**
 * The fixed stays a guest may still be shown: switched on, and not already begun.
 *
 * The same two tests `decideStayAvailability` applies, so a stay that appears in a list
 * is one the decision would accept. Occupancy is not tested here — a booked option stays
 * in the list, greyed by the blocks the caller already holds, because a list that
 * silently closed up around booked stays would tell a guest the host has less to offer
 * than they do.
 */
export function offeredFixedStays<T extends StayFixedStayPeriod>(
  periods: readonly T[],
  today: string,
): T[] {
  return periods.filter(
    (period) =>
      period.disabledAt === null && compareYmd(period.checkIn, today) >= 0,
  );
}

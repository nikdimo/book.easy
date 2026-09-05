import { windowsCoverStay } from "@/lib/utils/availability-windows";
import {
  compareYmd,
  isValidYmd,
  nightsBetweenYmd,
  ymdToDbDate,
} from "@/lib/utils/date-only";
import { stayLimitIssue, type StayLimits } from "@/lib/utils/stay-limits";
import {
  weeklyStayIssue,
  type ChangeoverWeekdayName,
} from "@/lib/utils/weekly-stay";

/**
 * The one rule that decides whether a listing *offers* a pair of dates at all.
 *
 * Two booking modes, one question. A FLEXIBLE listing offers whatever its availability
 * windows cover. A weekly listing (stored as FIXED_STAYS) uses that same calendar, then
 * additionally offers only whole weeks that begin and end on the weekday its host chose.
 *
 * What this deliberately does **not** answer:
 *
 * - **Is anyone already in those nights.** Bookings, holds, manual blocks and imported
 *   calendar blocks stay where they are, in `AvailabilityBlock`, and remain the
 *   authoritative negative answer. A stay this function calls offered may still be
 *   unbookable because someone took it, including through an overlapping fixed stay.
 * - **What it costs.** Identical in both modes.
 *
 * Dates cross this boundary as `YYYY-MM-DD`, not as `Date`. Every question here is a
 * calendar-date question — is this the same day, has this day gone by — and a `Date` read
 * against the wrong zone answers them a day out. Callers holding `@db.Date` values
 * convert with `dbDateToYmd`, which is the conversion the rest of the date-only code
 * already goes through.
 *
 * This is the shared rule, and it has three callers: `createBooking`, which decides
 * whether a request may become a booking; the public calendar and booking selection; and
 * the search filter, which expresses the same two branches in SQL rather than calling in
 * — see `buildListingWhere`. They agree because they are the same rule, not because
 * three implementations happen to line up.
 *
 * Everything that is listing-*wide* — availability windows, stay-length limits, and the
 * rule that a stay which has already begun is nobody's to take — applies in **both**
 * booking modes. Only the weekday shape is weekly-only.
 */

/** The two ways a listing can sell its dates, as `Listing.bookingMode` stores them. */
export const BOOKING_MODE_FLEXIBLE = "FLEXIBLE";
export const BOOKING_MODE_FIXED_STAYS = "FIXED_STAYS";

/** An open window in the half-open `[startDate, endDate)` convention, as `YYYY-MM-DD`. */
export interface StayAvailabilityWindowYmd {
  startDate: string;
  endDate: string;
}

export interface StayAvailabilityInput {
  /** `Listing.bookingMode`. Anything that is not FIXED_STAYS is treated as flexible. */
  bookingMode: string;
  /** `Listing.availabilityMode`. Applies in both booking modes. */
  availabilityMode: string;
  /** The listing's open windows. Applies in both booking modes when CLOSED. */
  windows: readonly StayAvailabilityWindowYmd[];
  /**
   * The weekday a weekly listing changes over on. Only consulted in the weekly branch.
   *
   * Null is a real state and it fails closed: a weekly listing whose host has not picked
   * a day offers nothing at all.
   */
  changeoverWeekday?: ChangeoverWeekdayName | null;
  /**
   * How long a stay may run — `PricingRule.minNights`/`maxNights`.
   *
   * **Listing-wide, and applied in both booking modes.** This used to be documented as
   * weekly-only, and the flexible branch really did return before consulting it: a
   * caller could hand these numbers over and have them silently ignored. Search and
   * `createBooking` applied them anyway, each in its own code, so the "shared" rule was
   * the one surface that disagreed. Omitted means unconstrained.
   */
  limits?: StayLimits;
  /** The stay being asked about, `[checkIn, checkOut)`. */
  checkIn: string;
  checkOut: string;
  /** Today as a marketplace calendar date — `todayYmd()`, never `new Date()`. */
  today: string;
}

export type StayNotOfferedReason =
  /** Not two calendar dates, or the stay does not run forwards. */
  | "INVALID_RANGE"
  /** The host has not opened these dates on a CLOSED calendar. */
  | "OUTSIDE_AVAILABILITY_WINDOWS"
  /** WEEKLY: the host has not chosen a changeover day, so nothing is offered. */
  | "NO_CHANGEOVER_DAY"
  /** WEEKLY: check-in is not on the listing's changeover weekday. */
  | "WRONG_CHECK_IN_DAY"
  /** WEEKLY: checkout is not on it either, so the stay is not whole weeks. */
  | "WRONG_CHECK_OUT_DAY"
  /** Shorter than the listing's minimum stay. Both booking modes. */
  | "BELOW_MINIMUM"
  /** Longer than the listing's maximum stay. Both booking modes. */
  | "ABOVE_MAXIMUM"
  /** The stay has already begun. */
  | "STAY_IN_PAST";

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
 * Whether the listing offers these dates.
 *
 * The reasons are ordered so the caller learns the most specific true thing. Invalid
 * ranges are refused first, then listing-wide availability windows, then — per mode —
 * the weekly shape before stay length, and stay length before the past-date rule.
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

  // Availability is listing-wide. OPEN calendars sell every unblocked night; CLOSED
  // calendars sell only nights inside the union of their windows, in either booking mode.
  if (input.availabilityMode === "CLOSED") {
    const covered = windowsCoverStay(
      input.windows.map((window) => ({
        startDate: ymdToDbDate(window.startDate),
        endDate: ymdToDbDate(window.endDate),
      })),
      ymdToDbDate(input.checkIn),
      ymdToDbDate(input.checkOut),
    );
    if (!covered) {
      return { offered: false, reason: "OUTSIDE_AVAILABILITY_WINDOWS" };
    }
  }

  if (!isFixedStayBookingMode(input.bookingMode)) {
    // Two listing-wide rules the flexible branch used to return above.
    //
    // They are spelled out here rather than hoisted above the weekly branch on purpose.
    // `weeklyStayIssue` deliberately reports WRONG_CHECK_IN_DAY / WRONG_CHECK_OUT_DAY
    // ahead of BELOW_MINIMUM / ABOVE_MAXIMUM — telling a guest their fortnight is too
    // short is no help when the real problem is that they picked a Tuesday — and a
    // common check run first would invert that. Same for the past-date rule: moving it
    // ahead of the weekly shape would change which message a weekly guest sees.
    if (input.limits) {
      const issue = stayLimitIssue(
        nightsBetweenYmd(input.checkIn, input.checkOut),
        input.limits,
      );
      if (issue) return { offered: false, reason: issue };
    }
    if (compareYmd(input.checkIn, input.today) < 0) {
      return { offered: false, reason: "STAY_IN_PAST" };
    }
    return { offered: true, fixedStayPeriodId: null };
  }

  // A weekly listing sells whole weeks starting and ending on one day the host chose.
  // The whole rule lives in `weekly-stay`, so this path, the search filter, the booking
  // transaction and the guest calendar cannot come to four different answers about the
  // same pair of dates.
  const issue = weeklyStayIssue({
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    changeoverWeekday: input.changeoverWeekday,
    limits: input.limits ?? { minNights: 1, maxNights: null },
  });
  if (issue) return { offered: false, reason: issue };

  // A stay that has already begun is nobody's to take, whatever its shape. Kept *after*
  // `weeklyStayIssue` so a weekly guest who also picked the wrong weekday still hears
  // about the weekday first, which is the message that tells them what to do next.
  if (compareYmd(input.checkIn, input.today) < 0) {
    return { offered: false, reason: "STAY_IN_PAST" };
  }

  // No period id: a weekly booking is an ordinary pair of dates, and nothing about it
  // points at a stored row.
  return { offered: true, fixedStayPeriodId: null };
}

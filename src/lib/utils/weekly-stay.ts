import {
  addDaysToYmd,
  compareYmd,
  isValidYmd,
  nightsBetweenYmd,
  weekdayOfYmd,
  type Weekday,
} from "@/lib/utils/date-only";
import {
  stayLengthCap,
  stayLimitIssue,
  type StayLimits,
} from "@/lib/utils/stay-limits";

export type { StayLimits };

/**
 * Weekly stays — the whole rule, in one place.
 *
 * A weekly listing sells whole weeks that start and end on one day the host picked. That
 * is four conditions and no more:
 *
 * 1. check-in falls on the changeover weekday,
 * 2. checkout falls on the same weekday — which is the same thing as saying
 * 3. the stay is a whole number of weeks, and
 * 4. its length is inside the listing's ordinary minimum and maximum stay.
 *
 * Note what is *not* here. There is no season, no list of offered stays, no per-stay row,
 * and no stay-length menu: a host who wants only fortnights sets a 14-night minimum, and
 * one who wants at most three weeks sets a 21-night maximum. Those two numbers are the
 * listing's own `PricingRule.minNights`/`maxNights` — the same pair a flexible listing
 * uses — so there is exactly one place a stay length is configured, whichever way the
 * listing sells.
 *
 * Availability is not here either, and deliberately: whether the nights are free is
 * answered by `AvailabilityBlock` exactly as it is for every other stay, and the
 * half-open `[checkIn, checkOut)` convention means a checkout day is another guest's
 * arrival day rather than a night anyone occupies.
 *
 * Every comparison goes through the repository's date-only helpers, so a week is seven
 * calendar days whatever the clocks did in the middle of it.
 */

/** The stored weekday names, in `Date#getUTCDay` order so the index *is* the weekday. */
export const CHANGEOVER_WEEKDAY_NAMES = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

/** `Listing.changeoverWeekday` as the database stores it. */
export type ChangeoverWeekdayName = (typeof CHANGEOVER_WEEKDAY_NAMES)[number];

/** Monday first, the order a European host reads a week in. */
export const CHANGEOVER_WEEKDAY_CHOICES: readonly ChangeoverWeekdayName[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

export const NIGHTS_PER_WEEK = 7;

export function isChangeoverWeekdayName(
  value: unknown,
): value is ChangeoverWeekdayName {
  return (
    typeof value === "string" &&
    (CHANGEOVER_WEEKDAY_NAMES as readonly string[]).includes(value)
  );
}

/** The stored name as the 0–6 number every date helper here speaks. */
export function changeoverWeekdayIndex(name: ChangeoverWeekdayName): Weekday {
  return CHANGEOVER_WEEKDAY_NAMES.indexOf(name) as Weekday;
}

export function changeoverWeekdayName(index: Weekday): ChangeoverWeekdayName {
  return CHANGEOVER_WEEKDAY_NAMES[index];
}

/** Whether a calendar date is a day this listing changes over on. */
export function isChangeoverDay(
  ymd: string,
  changeover: ChangeoverWeekdayName,
): boolean {
  return weekdayOfYmd(ymd) === changeoverWeekdayIndex(changeover);
}

/**
 * The listing's stay-length rule.
 *
 * @deprecated Use `StayLimits`. These limits are listing-wide and apply in both booking
 * modes; the weekly name is what let the flexible branch of `decideStayAvailability`
 * look complete without them. Kept as an alias so existing call sites keep compiling.
 */
export type WeeklyStayLimits = StayLimits;

export type WeeklyStayIssue =
  /** Not two calendar dates, or the stay does not run forwards. */
  | "INVALID_RANGE"
  /** The listing sells weekly stays but its host has not chosen a changeover day. */
  | "NO_CHANGEOVER_DAY"
  /** Check-in is not on the changeover weekday. */
  | "WRONG_CHECK_IN_DAY"
  /** Checkout is not on the changeover weekday — which is also "not whole weeks". */
  | "WRONG_CHECK_OUT_DAY"
  /** Shorter than the listing's minimum stay. */
  | "BELOW_MINIMUM"
  /** Longer than the listing's maximum stay. */
  | "ABOVE_MAXIMUM";

/**
 * The stay-length cap, or null when the host has not set one.
 *
 * @deprecated Use `stayLengthCap`. This was a second copy of that rule kept "identical"
 * by hand; it is now the same function, so the two can no longer drift.
 */
export const weeklyStayCap = stayLengthCap;

/**
 * What is wrong with this stay on this listing, or null when nothing is.
 *
 * Ordered so the caller learns the most useful true thing first: a malformed range before
 * a missing changeover day, the wrong arrival day before the wrong departure day, and the
 * shape of the stay before its length — telling a guest their fortnight is too short is
 * no help when the real problem is that they picked a Tuesday.
 */
export function weeklyStayIssue(input: {
  checkIn: string;
  checkOut: string;
  changeoverWeekday: ChangeoverWeekdayName | null | undefined;
  limits: WeeklyStayLimits;
}): WeeklyStayIssue | null {
  const { checkIn, checkOut, changeoverWeekday, limits } = input;
  if (!isValidYmd(checkIn) || !isValidYmd(checkOut)) return "INVALID_RANGE";
  if (compareYmd(checkOut, checkIn) <= 0) return "INVALID_RANGE";
  // Fails closed. A weekly listing with no changeover day has not finished being set up,
  // and the safe reading of an unfinished rule is that nothing satisfies it.
  if (!isChangeoverWeekdayName(changeoverWeekday)) return "NO_CHANGEOVER_DAY";

  if (!isChangeoverDay(checkIn, changeoverWeekday)) return "WRONG_CHECK_IN_DAY";
  // Same weekday and forwards is exactly "a whole number of weeks" — there is no second
  // modulo test to get out of step with this one.
  if (!isChangeoverDay(checkOut, changeoverWeekday)) return "WRONG_CHECK_OUT_DAY";

  // Length last, and only after the shape: the listing-wide limit rule, shared with the
  // flexible branch of `decideStayAvailability` and with the search filter.
  return stayLimitIssue(nightsBetweenYmd(checkIn, checkOut), limits);
}

export function isWeeklyStay(input: {
  checkIn: string;
  checkOut: string;
  changeoverWeekday: ChangeoverWeekdayName | null | undefined;
  limits: WeeklyStayLimits;
}): boolean {
  return weeklyStayIssue(input) === null;
}

/**
 * How many whole weeks a listing's limits allow, as a first and last week count.
 *
 * The minimum is rounded *up* to a whole week and the maximum *down*: a 10-night minimum
 * on a weekly listing means two weeks, not one, and a 30-night maximum means four weeks,
 * not four-and-a-fraction. Returns null when the two cannot both be satisfied — a listing
 * whose minimum is 20 and whose maximum is 21 has no whole week between them, which is a
 * real (if unlucky) configuration and not an error to throw on.
 */
export function weeklyStayWeekRange(
  limits: WeeklyStayLimits,
): { minWeeks: number; maxWeeks: number } | null {
  const minWeeks = Math.max(1, Math.ceil(limits.minNights / NIGHTS_PER_WEEK));
  const cap = weeklyStayCap(limits.maxNights);
  const maxWeeks =
    cap === null ? Number.POSITIVE_INFINITY : Math.floor(cap / NIGHTS_PER_WEEK);
  if (maxWeeks < minWeeks) return null;
  return { minWeeks, maxWeeks };
}

/**
 * Every checkout a guest could pick for this check-in, soonest first.
 *
 * Length only — this says which dates the *rule* permits, and says nothing about whether
 * the nights are free. Occupancy is the caller's to apply, from the same blocked-date
 * data every other surface reads, so there is one answer to "is that night taken".
 *
 * `horizonEnd` is exclusive and bounds the walk: an uncapped listing would otherwise
 * generate checkouts for ever.
 */
export function weeklyCheckOutDates(input: {
  checkIn: string;
  changeoverWeekday: ChangeoverWeekdayName | null | undefined;
  limits: WeeklyStayLimits;
  /** Exclusive. Nothing on or after this date is offered. */
  horizonEnd?: string;
}): string[] {
  const { checkIn, changeoverWeekday, limits, horizonEnd } = input;
  if (!isValidYmd(checkIn)) return [];
  if (!isChangeoverWeekdayName(changeoverWeekday)) return [];
  if (!isChangeoverDay(checkIn, changeoverWeekday)) return [];

  const weeks = weeklyStayWeekRange(limits);
  if (!weeks) return [];

  const dates: string[] = [];
  for (let week = weeks.minWeeks; week <= weeks.maxWeeks; week += 1) {
    const checkOut = addDaysToYmd(checkIn, week * NIGHTS_PER_WEEK);
    if (horizonEnd && compareYmd(checkOut, horizonEnd) > 0) break;
    dates.push(checkOut);
    // An uncapped listing still stops somewhere: without a horizon, offer the same
    // eighteen-month-ish span the rest of the calendar is bounded by rather than looping.
    if (!Number.isFinite(weeks.maxWeeks) && dates.length >= 78) break;
  }
  return dates;
}

/**
 * The shortest stay this listing will actually accept, in nights.
 *
 * Not the same number as `minNights`, and the difference is the whole reason this
 * exists. A weekly listing sells whole weeks, so a stored 1-night minimum still refuses
 * every stay shorter than one changeover-to-changeover week: the real floor is
 * `minNights` rounded *up* to a whole week. A flexible listing has no such rounding and
 * its floor is `minNights` itself.
 *
 * Anything that states or prices "the shortest stay a guest can book" reads this rather
 * than the raw column, so a worked example on a weekly listing cannot quote a one-night
 * total for a stay the booking path would reject.
 *
 * Returns null when the limits cannot be satisfied at all — a weekly listing whose
 * maximum leaves no whole week inside it. That is a real configuration, not an error,
 * and the caller decides what to say about it.
 */
export function shortestBookableNights(input: {
  bookingMode: "FLEXIBLE" | "FIXED_STAYS";
  limits: WeeklyStayLimits;
}): number | null {
  const { bookingMode, limits } = input;
  const floor = Math.max(1, limits.minNights);
  if (bookingMode !== "FIXED_STAYS") {
    const cap = weeklyStayCap(limits.maxNights);
    return cap !== null && cap < floor ? null : floor;
  }
  const weeks = weeklyStayWeekRange(limits);
  return weeks ? weeks.minWeeks * NIGHTS_PER_WEEK : null;
}

/** The largest stay length the host can express in the editor. */
export const STAY_LIMIT_CEILING = 365;

/**
 * The maximum stay worth *stating* to a host, or null when there is nothing to say.
 *
 * Display only — but it must remain truthful to `weeklyStayCap`. Zero is the stored
 * spelling of "no maximum". The schema default of 365 is still enforced by search and
 * booking, so hiding it would tell the host there is no cap while refusing longer stays.
 */
export function statedStayCap(maxNights: number | null | undefined): number | null {
  return weeklyStayCap(maxNights);
}

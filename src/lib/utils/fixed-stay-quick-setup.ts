import {
  addDaysToYmd,
  compareYmd,
  isValidYmd,
  nightsBetweenYmd,
  weekdayOfYmd,
  type Weekday,
} from "@/lib/utils/date-only";
import {
  checkOutForFixedStay,
  fixedStayPeriodKey,
  isFixedStayNights,
  sortFixedStayPeriods,
  type FixedStayNights,
  type FixedStayPeriodRange,
} from "@/lib/utils/fixed-stay-periods";

/**
 * Quick setup — a bulk date generator for fixed stays, and nothing more.
 *
 * A villa let by the week has the same conversation every spring: Saturday changeover,
 * June to September, one week or two. Typing twenty-eight check-in dates by hand is the
 * only thing standing between the host and a season, so this turns four answers into the
 * list.
 *
 * What it is emphatically **not** is a recurring-stay subsystem. Nothing about the
 * season, the weekday or the rule is stored anywhere: it produces ordinary periods,
 * identical in every respect to ones added one at a time, and once they exist nothing
 * can tell where they came from. There is no schedule to re-run, nothing to keep in
 * sync, and no second code path through the booking rules.
 *
 * Pure and deterministic. The same four answers always produce the same list, in the
 * same order, with no dependence on today's date, the server's time zone or the order
 * the caller passed the lengths in — which is what makes re-running a setup a safe
 * operation for the write layer: it can compare the output against what the listing
 * already offers and create only what is missing.
 */

/** Monday first, the way a European season is talked about. */
export const CHANGEOVER_WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

/** The changeover day nearly every weekly let uses. */
export const DEFAULT_CHANGEOVER_WEEKDAY: Weekday = 6;

/**
 * How far ahead one run may reach, in nights.
 *
 * Roughly the eighteen months the guest calendar is bounded by, so Quick setup cannot
 * fill the table with options no guest will ever be shown. A validation answer, not a
 * silent truncation: a host who asked for more is told, rather than quietly given less.
 */
export const QUICK_SETUP_MAX_SEASON_NIGHTS = 550;

/** What one run may produce. A busy season is thirty rows; two hundred is a mistake. */
export const QUICK_SETUP_MAX_PERIODS = 200;

export interface FixedStayQuickSetup {
  /** Earliest permitted check-in, inclusive. `YYYY-MM-DD`. */
  seasonStart: string;
  /**
   * Latest permitted checkout, inclusive. `YYYY-MM-DD`.
   *
   * The last day a guest may *leave*, not the last day they may arrive: a stay is
   * generated only if it finishes on or before this date. A host who says "we close on
   * 30 September" does not want a fortnight starting on the 27th.
   */
  lastCheckOut: string;
  changeoverWeekday: Weekday;
  /** The lengths to generate from each changeover day: 7, 14, or both. */
  nights: readonly FixedStayNights[];
}

export interface GeneratedFixedStay extends FixedStayPeriodRange {
  nights: FixedStayNights;
}

/**
 * The first changeover day on or after a date.
 *
 * Modular arithmetic on the weekday rather than a day-at-a-time walk, so the answer does
 * not depend on how far away the weekday happens to be. Returns the date itself when it
 * already falls on the changeover day.
 */
export function nextChangeoverOnOrAfter(ymd: string, weekday: Weekday): string {
  return addDaysToYmd(ymd, (weekday - weekdayOfYmd(ymd) + 7) % 7);
}

export type FixedStayQuickSetupIssue =
  | "MISSING_START"
  | "MISSING_LAST_CHECKOUT"
  | "INVALID_DATE"
  | "INVALID_CHANGEOVER_WEEKDAY"
  | "NO_LENGTHS"
  | "UNSUPPORTED_LENGTH"
  | "SEASON_REVERSED"
  | "SEASON_TOO_LONG"
  | "TOO_MANY_PERIODS"
  | "NOTHING_TO_GENERATE";

function isChangeoverWeekday(value: unknown): value is Weekday {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 6
  );
}

/**
 * What is still wrong with the four answers, or `null` when they describe a season.
 *
 * Ordered so the caller is told the one thing actually stopping them, cheapest question
 * first — an empty field before a reversed season, a reversed season before the count of
 * what it would produce.
 *
 * Deliberately says nothing about today. A season that has already passed generates
 * exactly the stays it describes; whether a past stay may be *offered* is an
 * availability question, answered by `stay-availability`, and answering it twice in two
 * places is how the two answers start to disagree.
 */
export function validateFixedStayQuickSetup(
  setup: FixedStayQuickSetup,
): FixedStayQuickSetupIssue | null {
  if (setup.seasonStart.trim() === "") return "MISSING_START";
  if (setup.lastCheckOut.trim() === "") return "MISSING_LAST_CHECKOUT";
  if (!isValidYmd(setup.seasonStart) || !isValidYmd(setup.lastCheckOut)) {
    return "INVALID_DATE";
  }
  if (!isChangeoverWeekday(setup.changeoverWeekday)) {
    return "INVALID_CHANGEOVER_WEEKDAY";
  }
  if (setup.nights.length === 0) return "NO_LENGTHS";
  if (!setup.nights.every(isFixedStayNights)) return "UNSUPPORTED_LENGTH";
  if (compareYmd(setup.lastCheckOut, setup.seasonStart) <= 0) {
    return "SEASON_REVERSED";
  }
  if (
    nightsBetweenYmd(setup.seasonStart, setup.lastCheckOut) >
    QUICK_SETUP_MAX_SEASON_NIGHTS
  ) {
    return "SEASON_TOO_LONG";
  }

  const generated = generateFixedStayPeriods(setup);
  if (generated.length > QUICK_SETUP_MAX_PERIODS) return "TOO_MANY_PERIODS";
  if (generated.length === 0) return "NOTHING_TO_GENERATE";
  return null;
}

/**
 * Every stay the four answers describe, sorted and free of exact duplicates.
 *
 * Walks changeover day to changeover day in steps of seven from the first such day on or
 * after the season start, emitting one stay per requested length from each, and keeping
 * only the ones that finish on or before the last checkout. A fortnight therefore
 * overlaps the week that follows it, which is not an accident to be corrected:
 * overlapping offers are how "one week or two from the 1st" is expressed, and booking
 * either one withdraws the other through the ordinary block rules.
 *
 * Total: invalid or half-typed input yields an empty list rather than a throw, so a
 * preview can be recomputed on every keystroke.
 */
export function generateFixedStayPeriods(
  setup: FixedStayQuickSetup,
): GeneratedFixedStay[] {
  if (!isValidYmd(setup.seasonStart) || !isValidYmd(setup.lastCheckOut)) {
    return [];
  }
  if (!isChangeoverWeekday(setup.changeoverWeekday)) return [];
  if (compareYmd(setup.lastCheckOut, setup.seasonStart) <= 0) return [];

  // Shortest first, deduplicated, so the caller cannot change the output by passing
  // [14, 7] instead of [7, 14].
  const lengths = [...new Set(setup.nights)].sort((left, right) => left - right);
  if (lengths.length === 0) return [];
  if (!lengths.every(isFixedStayNights)) return [];

  const stays: GeneratedFixedStay[] = [];
  let cursor = nextChangeoverOnOrAfter(setup.seasonStart, setup.changeoverWeekday);

  while (compareYmd(cursor, setup.lastCheckOut) < 0) {
    for (const nights of lengths) {
      const checkOut = checkOutForFixedStay(cursor, nights);
      // The stay has to finish inside the season, not merely start in it.
      if (compareYmd(checkOut, setup.lastCheckOut) <= 0) {
        stays.push({ checkIn: cursor, checkOut, nights });
      }
    }
    cursor = addDaysToYmd(cursor, 7);
  }

  return sortFixedStayPeriods(stays);
}

export interface FixedStayQuickSetupRow extends GeneratedFixedStay {
  /**
   * The listing already offers exactly this check-in and checkout, so a write would be
   * skipped. True whatever state that existing period is in — open, switched off or
   * already booked — because all three mean the same thing here: there is a row for
   * these dates and Quick setup has nothing to add.
   */
  duplicate: boolean;
}

/**
 * The generated list with everything the listing already offers marked.
 *
 * This is what makes re-running the same setup safe: the write layer creates only the
 * rows that are not marked, so a second run adds nothing, alters nothing, and cannot
 * disturb a period a guest has already booked.
 */
export function markExistingFixedStays(
  generated: readonly GeneratedFixedStay[],
  existing: readonly FixedStayPeriodRange[],
): FixedStayQuickSetupRow[] {
  const offered = new Set(existing.map(fixedStayPeriodKey));
  return generated.map((stay) => ({
    ...stay,
    duplicate: offered.has(fixedStayPeriodKey(stay)),
  }));
}

/** Only the rows a write would actually create. */
export function newFixedStaysFrom(
  rows: readonly FixedStayQuickSetupRow[],
): GeneratedFixedStay[] {
  return rows
    .filter((row) => !row.duplicate)
    .map((row) => ({
      checkIn: row.checkIn,
      checkOut: row.checkOut,
      nights: row.nights,
    }));
}

/** The whole run in one call: generate, then mark what the listing already offers. */
export function previewFixedStayQuickSetup(
  setup: FixedStayQuickSetup,
  existing: readonly FixedStayPeriodRange[],
): FixedStayQuickSetupRow[] {
  return markExistingFixedStays(generateFixedStayPeriods(setup), existing);
}

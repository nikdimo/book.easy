import {
  addDaysToYmd,
  compareYmd,
  isValidYmd,
  nightsBetweenYmd,
  ymdToDbDate,
} from "@/lib/utils/date-only";
import {
  checkOutFor,
  type FixedStayLength,
  type FixedStayPeriod,
} from "./periods";

/**
 * Quick setup — a bulk date generator, and nothing more.
 *
 * A villa let by the week has the same conversation every spring: Saturday changeover,
 * June to September, one week or two. Typing twenty-eight check-in dates by hand is the
 * only thing standing between the host and a season, so this turns four answers into
 * the list.
 *
 * What it is emphatically **not** is a recurring-stay subsystem. Nothing about the
 * season, the weekday or the rule is stored anywhere: the generator produces ordinary
 * periods, identical in every respect to ones added one at a time, and once they exist
 * nothing can tell where they came from. There is no schedule to re-run, nothing to
 * keep in sync, and no second code path through the booking rules.
 *
 * It can also only ever *add*. There is no update and no delete here, which is what
 * makes "never alter a booked period" true by construction rather than by a check that
 * someone has to remember to write: a date the listing already offers is skipped, and
 * whatever state that existing period is in — booked, disabled, or open — it is left
 * exactly as it stands.
 */

/** Sunday = 0, matching `Date#getUTCDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The weekday a calendar date falls on.
 *
 * Read off the UTC fields of the same instant `ymdToDbDate` builds, so a host in any
 * zone gets the same answer and a changeover day cannot drift onto its neighbour.
 */
export function weekdayOfYmd(ymd: string): Weekday {
  return ymdToDbDate(ymd).getUTCDay() as Weekday;
}

/** Monday first, the way a European season is talked about. */
export const CHANGEOVER_WEEKDAYS: { value: Weekday; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

/** The changeover day nearly every weekly let uses. */
export const DEFAULT_CHANGEOVER_WEEKDAY: Weekday = 6;

export function weekdayLabel(weekday: Weekday): string {
  return (
    CHANGEOVER_WEEKDAYS.find((day) => day.value === weekday)?.label ?? "Saturday"
  );
}

export interface QuickSetupDraft {
  /** Earliest permitted check-in, inclusive. */
  seasonStart: string;
  /**
   * Latest permitted checkout, inclusive.
   *
   * The last day a guest may *leave*, not the last day they may arrive — so a stay is
   * generated only when it finishes inside the season the host named. A host who says
   * "we close on 30 September" does not want a fortnight starting on the 27th.
   */
  seasonEnd: string;
  changeoverWeekday: Weekday;
  lengths: FixedStayLength[];
}

export type QuickSetupIssue =
  | "MISSING_START"
  | "MISSING_END"
  | "INVALID_DATE"
  | "NO_LENGTHS"
  | "SEASON_REVERSED"
  | "SEASON_ENDED"
  | "SEASON_TOO_LONG"
  | "TOO_MANY_PERIODS"
  | "NOTHING_TO_GENERATE";

/** One run may not fill the calendar with more than a busy season's worth. */
export const QUICK_SETUP_MAX_PERIODS = 200;

/**
 * How far ahead a season may reach, in nights.
 *
 * Roughly the eighteen months the guest calendar and the host calendar are both bounded
 * by, so Quick setup cannot generate options no guest will ever be shown.
 */
export const QUICK_SETUP_MAX_SEASON_NIGHTS = 550;

/** Where the walk starts: the season's own start, or today if the season has already
 *  begun. A stay in the past is not one anybody can book. */
function firstCandidate(draft: QuickSetupDraft, todayYmdValue: string): string {
  return compareYmd(draft.seasonStart, todayYmdValue) < 0
    ? todayYmdValue
    : draft.seasonStart;
}

export interface GeneratedStay {
  checkIn: string;
  checkOut: string;
  nights: FixedStayLength;
}

/**
 * Every stay the four answers describe.
 *
 * Walks changeover day to changeover day in steps of seven, emitting one stay per
 * requested length from each. A fortnight therefore overlaps the week that follows it,
 * which is not an accident to be corrected: overlapping offers are how "one week or two
 * from the 1st" is expressed, and booking either one withdraws the other through the
 * ordinary block rules.
 *
 * Pure and total — invalid input yields an empty list rather than a throw, so a
 * half-typed form is a quiet no-op while the host is still filling it in.
 */
export function generateFixedStayPeriods(
  draft: QuickSetupDraft,
  todayYmdValue: string,
): GeneratedStay[] {
  if (!isValidYmd(draft.seasonStart) || !isValidYmd(draft.seasonEnd)) return [];
  if (compareYmd(draft.seasonEnd, draft.seasonStart) <= 0) return [];
  if (draft.lengths.length === 0) return [];

  // Shortest first, so two options from one date read as a ladder in every list they
  // reach later.
  const lengths = [...new Set(draft.lengths)].sort((left, right) => left - right);

  let cursor = firstCandidate(draft, todayYmdValue);
  // At most six steps to the first changeover day; a seventh would be the same weekday
  // a week later.
  for (let step = 0; step < 7; step += 1) {
    if (weekdayOfYmd(cursor) === draft.changeoverWeekday) break;
    cursor = addDaysToYmd(cursor, 1);
  }

  const stays: GeneratedStay[] = [];
  while (
    compareYmd(cursor, draft.seasonEnd) <= 0 &&
    stays.length <= QUICK_SETUP_MAX_PERIODS
  ) {
    for (const nights of lengths) {
      const checkOut = checkOutFor(cursor, nights);
      // The stay has to finish inside the season, not merely start in it.
      if (compareYmd(checkOut, draft.seasonEnd) <= 0) {
        stays.push({ checkIn: cursor, checkOut, nights });
      }
    }
    cursor = addDaysToYmd(cursor, 7);
  }

  return stays;
}

/**
 * What is still wrong, or `null` when the host may preview.
 *
 * Ordered so the host is told the one thing that is actually stopping them, cheapest
 * question first — an empty field before a reversed season, a reversed season before
 * the count of what it would produce.
 */
export function quickSetupIssue(
  draft: QuickSetupDraft,
  todayYmdValue: string,
): QuickSetupIssue | null {
  if (draft.seasonStart.trim() === "") return "MISSING_START";
  if (draft.seasonEnd.trim() === "") return "MISSING_END";
  if (!isValidYmd(draft.seasonStart) || !isValidYmd(draft.seasonEnd)) {
    return "INVALID_DATE";
  }
  if (draft.lengths.length === 0) return "NO_LENGTHS";
  if (compareYmd(draft.seasonEnd, draft.seasonStart) <= 0) {
    return "SEASON_REVERSED";
  }
  if (compareYmd(draft.seasonEnd, todayYmdValue) < 0) return "SEASON_ENDED";
  if (
    nightsBetweenYmd(firstCandidate(draft, todayYmdValue), draft.seasonEnd) >
    QUICK_SETUP_MAX_SEASON_NIGHTS
  ) {
    return "SEASON_TOO_LONG";
  }

  const generated = generateFixedStayPeriods(draft, todayYmdValue);
  if (generated.length > QUICK_SETUP_MAX_PERIODS) return "TOO_MANY_PERIODS";
  if (generated.length === 0) return "NOTHING_TO_GENERATE";
  return null;
}

export interface QuickSetupPreviewRow extends GeneratedStay {
  /** The listing already offers exactly this check-in and checkout. It will be skipped,
   *  and whatever state it is in stays exactly as it is. */
  duplicate: boolean;
}

/**
 * The generated list, with everything the listing already offers marked.
 *
 * A duplicate is decided on the two dates alone — not on whether the existing period is
 * open, switched off or booked. All three mean the same thing here: there is already a
 * row for these dates, so Quick setup has nothing to add and will not touch it.
 */
export function quickSetupPreview(
  draft: QuickSetupDraft,
  periods: readonly FixedStayPeriod[],
  todayYmdValue: string,
): QuickSetupPreviewRow[] {
  const existing = new Set(
    periods.map((period) => `${period.checkIn}/${period.checkOut}`),
  );
  return generateFixedStayPeriods(draft, todayYmdValue).map((stay) => ({
    ...stay,
    duplicate: existing.has(`${stay.checkIn}/${stay.checkOut}`),
  }));
}

/** Only the rows a confirm would actually create. */
export function newStaysFrom(rows: readonly QuickSetupPreviewRow[]): GeneratedStay[] {
  return rows.filter((row) => !row.duplicate);
}

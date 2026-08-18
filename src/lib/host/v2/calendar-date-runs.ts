import { addDaysToYmd } from "@/lib/utils/date-only";

/**
 * Turning a set of dates back into the ranges the availability and pricing services
 * take.
 *
 * Both of those work on `[checkIn, checkOut)` ranges, while everything this panel
 * decides is decided per date: which nights can actually move, what each one cost
 * before an edit. Sending one range spanning the whole selection would sweep up the
 * dates in between — the reservation the host cannot touch, the older block they never
 * mentioned, the one night that already had its own price — so the dates that genuinely
 * change are collapsed into runs and each run is sent on its own.
 */

export interface DateRun {
  /** Inclusive first night. */
  start: string;
  /** Inclusive last night. `startDate`/`endDate` conversion is the caller's job. */
  end: string;
}

/**
 * Consecutive dates collapsed into inclusive runs, splitting whenever `keyOf` changes.
 *
 * The key is what makes one run distinct from the next beyond mere adjacency: undoing a
 * price edit restores a different amount to each date, so two adjacent nights that were
 * priced differently before cannot share a range.
 */
export function contiguousRunsBy<T>(
  dates: string[],
  keyOf: (date: string) => T,
): Array<DateRun & { key: T }> {
  const runs: Array<DateRun & { key: T }> = [];
  for (const date of dates) {
    const key = keyOf(date);
    const last = runs[runs.length - 1];
    if (last && last.key === key && addDaysToYmd(last.end, 1) === date) {
      last.end = date;
      continue;
    }
    runs.push({ start: date, end: date, key });
  }
  return runs;
}

/** Consecutive dates collapsed into inclusive runs. */
export function contiguousRuns(dates: string[]): DateRun[] {
  return contiguousRunsBy(dates, () => null).map(({ start, end }) => ({
    start,
    end,
  }));
}

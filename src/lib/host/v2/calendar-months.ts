import { addDaysToYmd, compareYmd } from "@/lib/utils/date-only";

/**
 * Month arithmetic for the calendar's vertical month stream.
 *
 * Kept as string maths rather than `Date` for the same reason the rest of the v2
 * calendar is: a civil month is a fact about the marketplace's calendar, and routing it
 * through a `Date` would re-read it against the browser's own midnight and time zone.
 * It also means the stream's boundaries can be unit tested without a clock.
 */

/** First day of the month a date falls in, `YYYY-MM-01`. */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const zeroBased = Number(month.slice(5, 7)) - 1 + delta;
  const shiftedYear = year + Math.floor(zeroBased / 12);
  // `%` keeps the sign of the dividend in JS, so a negative delta needs the extra
  // wrap before the month index can be trusted.
  const shiftedMonth = ((zeroBased % 12) + 12) % 12;
  return `${String(shiftedYear).padStart(4, "0")}-${String(shiftedMonth + 1).padStart(2, "0")}-01`;
}

/**
 * The last month the loaded window reaches. `horizonEnd` is exclusive, so a window that
 * ends on the first of a month must not offer that month — there is one day of data in
 * it and none of it is loaded.
 */
export function lastMonth(horizonEnd: string): string {
  return monthOf(addDaysToYmd(horizonEnd, -1));
}

/**
 * Every month the stream renders, from the month containing `today` to the last month
 * the horizon reaches. The list is what the stream scrolls through, so it is also what
 * bounds the previous/next controls — there is no month button that can run off the
 * loaded data.
 */
export function monthsInWindow(today: string, horizonEnd: string): string[] {
  const first = monthOf(today);
  const last = lastMonth(horizonEnd);
  if (compareYmd(last, first) <= 0) return [first];

  const months: string[] = [];
  let cursor = first;
  while (compareYmd(cursor, last) <= 0) {
    months.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return months;
}

/** The month in `months` nearest to `month`, so a jump can never leave the stream. */
export function clampMonth(month: string, months: string[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return month;
  if (compareYmd(month, first) < 0) return first;
  if (compareYmd(month, last) > 0) return last;
  return month;
}

/** Whether a `[start, end]` inclusive run of dates touches this month at all. */
export function monthIntersectsRange(
  month: string,
  range: { start: string; end: string },
): boolean {
  const monthEnd = addDaysToYmd(shiftMonth(month, 1), -1);
  return compareYmd(range.start, monthEnd) <= 0 && compareYmd(range.end, month) >= 0;
}

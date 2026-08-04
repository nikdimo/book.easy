const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseYmdParts(ymd: string) {
  const match = YMD_RE.exec(ymd);
  if (!match) {
    throw new Error(`Invalid date-only value: ${ymd}`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(value.getTime()) ||
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date-only value: ${ymd}`);
  }

  return { year, month, day };
}

function assertValidDate(value: Date) {
  if (Number.isNaN(value.getTime())) {
    throw new Error("Invalid date");
  }
}

export function compareYmd(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function dbDateToYmd(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : new Date(date.getTime());
  assertValidDate(value);

  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * The one time zone this marketplace's civil dates are read in.
 *
 * There is no per-property or per-owner time zone stored anywhere (see the note on
 * `todayYmd`), so "what day is it" has to be answered by a single marketplace rule.
 * That rule already exists for booking emails — `BOOKING_TIME_ZONE`, defaulting to
 * Europe/Skopje — and this is the same rule made readable from the browser too.
 *
 * Deliberately a `NEXT_PUBLIC_` variable: it is inlined into both the server and the
 * client bundle, so the date the wizard shows and the date the publish action validates
 * cannot drift apart. Keep it equal to `BOOKING_TIME_ZONE`.
 */
export const MARKETPLACE_TIME_ZONE =
  process.env.NEXT_PUBLIC_BOOKING_TIME_ZONE || "Europe/Skopje";

/**
 * The civil date an instant falls on in a given time zone.
 *
 * Uses `Intl` rather than offset arithmetic so daylight saving is handled by the
 * platform's tz database instead of by hand, and returns a date-only string so the
 * result cannot be re-interpreted against another zone later.
 */
export function ymdInTimeZone(instant: Date, timeZone: string): string {
  assertValidDate(instant);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const part = (type: "year" | "month" | "day") =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Today, as a civil date, in the marketplace's time zone.
 *
 * **Not UTC.** Reading it in UTC put hosts an hour or two ahead of UTC — Copenhagen and
 * Skopje are both UTC+1/+2 — on *yesterday's* date between local midnight and 01:00 or
 * 02:00, which quietly rejected "available from tomorrow" as a past date and set the
 * date field's `min` a day early.
 *
 * **Known limitation:** this is one zone for the whole marketplace, not the property's
 * own. A listing in a genuinely different zone will roll over to the next day at the
 * marketplace's midnight rather than its own. Fixing that properly means storing a time
 * zone per property and deciding whose day counts for booking cut-offs — a product
 * decision, not a helper change. Until then one documented rule that the server and the
 * browser both follow beats two rules that disagree.
 */
export function todayYmd(
  timeZone: string = MARKETPLACE_TIME_ZONE,
  now: Date = new Date(),
): string {
  return ymdInTimeZone(now, timeZone);
}

export function ymdToDbDate(ymd: string): Date {
  const { year, month, day } = parseYmdParts(ymd);
  return new Date(Date.UTC(year, month - 1, day));
}

export function ymdToLocalDate(ymd: string): Date {
  const { year, month, day } = parseYmdParts(ymd);
  return new Date(year, month - 1, day);
}

export function dbDateToLocalDate(date: Date | string): Date {
  return ymdToLocalDate(dbDateToYmd(date));
}

export function addDaysToYmd(ymd: string, days: number): string {
  const value = ymdToDbDate(ymd);
  value.setUTCDate(value.getUTCDate() + days);
  return dbDateToYmd(value);
}

export function eachYmdInclusive(startYmd: string, endYmd: string): string[] {
  if (compareYmd(endYmd, startYmd) < 0) return [];

  const days: string[] = [];
  let cursor = startYmd;

  while (compareYmd(cursor, endYmd) <= 0) {
    days.push(cursor);
    cursor = addDaysToYmd(cursor, 1);
  }

  return days;
}

export function eachYmdExclusive(startYmd: string, endExclusiveYmd: string): string[] {
  if (compareYmd(endExclusiveYmd, startYmd) <= 0) return [];

  const days: string[] = [];
  let cursor = startYmd;

  while (compareYmd(cursor, endExclusiveYmd) < 0) {
    days.push(cursor);
    cursor = addDaysToYmd(cursor, 1);
  }

  return days;
}

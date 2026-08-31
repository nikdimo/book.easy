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

/** Whether a value is a real calendar date in the app's `yyyy-MM-dd` wire format. */
export function isValidYmd(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    parseYmdParts(value);
    return true;
  } catch {
    return false;
  }
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

/**
 * The marketplace calendar date an *instant* falls on.
 *
 * The same rule as `todayYmd`, named for the case where the instant is not now:
 * `acceptedAt`, `cancelledAt` and the other timestamp columns are moments, and the
 * civil day a moment belongs to has to be read in the marketplace zone like every
 * other date in the booking flow. Reading their UTC fields instead — which is what
 * `dbDateToYmd` does, correctly, for `@db.Date` columns — puts anything that happened
 * between local midnight and 01:00 or 02:00 on the previous day, which is how a
 * payment deadline floor could land in the past the moment a host accepted late at
 * night.
 */
export function marketplaceYmd(instant: Date): string {
  return ymdInTimeZone(instant, MARKETPLACE_TIME_ZONE);
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

/**
 * Nights between two calendar dates, `[start, end)` — the booking convention.
 *
 * Counted in UTC, where every day is exactly 86 400 000 ms, so the answer never
 * depends on the server's zone. `differenceInDays` counts *local* calendar days, and
 * over UTC-midnight anchors it loses a night across an autumn DST change: 24 October
 * to 27 October in Europe/Skopje is three nights, but the local clock walks 02:00 →
 * 01:00 on the 25th, so the last day looks short and the count comes back two. That
 * is a min/max-stay decision, so the miscount rejects a stay the calendar sold.
 */
export function nightsBetweenYmd(startYmd: string, endExclusiveYmd: string): number {
  const start = ymdToDbDate(startYmd).getTime();
  const end = ymdToDbDate(endExclusiveYmd).getTime();
  return Math.round((end - start) / 86_400_000);
}

/**
 * `Date.setMonth`'s own arithmetic — end-of-month rollover included — in UTC.
 *
 * The horizons the calendar and the rate range are bounded by used to be built with
 * `setMonth` on a server-local midnight, which is the same calculation read off a
 * different clock. Doing it in UTC keeps the horizon on the day it names.
 */
export function addMonthsToYmd(ymd: string, months: number): string {
  const value = ymdToDbDate(ymd);
  value.setUTCMonth(value.getUTCMonth() + months);
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

/** "HH:MM" on a 24-hour clock — the shape every stay time is stored in. */
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Whether a value is a wall-clock time this project can place on a calendar day. */
export function isValidHhmm(value: unknown): value is string {
  return typeof value === "string" && HHMM_RE.test(value);
}

/**
 * The offset, in milliseconds, that a time zone was running at a given instant.
 *
 * Read out of `Intl` rather than a table, so the answer comes from the platform's tz
 * database and follows every historical and future DST rule without this file knowing
 * any of them.
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((candidate) => candidate.type === type)?.value);

  // `hour12: false` renders midnight as 24 in some ICU versions.
  const hour = part("hour") % 24;
  const asUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    hour,
    part("minute"),
    part("second"),
  );
  // Seconds are the finest field formatted, so drop sub-second noise from the input.
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which a wall-clock time occurs on a calendar day in a time zone.
 *
 * The inverse of `ymdInTimeZone`, and the one place that turns "10:00 on 2026-03-29 in
 * Skopje" into a real moment. **Never** build such an instant by setting UTC hours on a
 * `@db.Date` value: that reads a marketplace wall time as if it were UTC, which is one
 * or two hours off all year and moves with the season.
 *
 * DST-safe by construction: the first pass guesses the offset from the wall time read
 * as UTC, the second re-reads the offset at the instant that guess produced, which is
 * the side of the transition the result actually falls on. Where a wall time does not
 * exist at all — the spring-forward gap — the result lands just after the jump. Where
 * it happens twice during fall-back, the later occurrence is chosen; that conservative
 * choice cannot open a checkout-dependent flow before the repeated wall time is over.
 */
export function zonedTimeToInstant(
  ymd: string,
  hhmm: string,
  timeZone: string = MARKETPLACE_TIME_ZONE,
): Date {
  const { year, month, day } = parseYmdParts(ymd);
  const time = HHMM_RE.exec(hhmm);
  if (!time) {
    throw new Error(`Invalid time-of-day value: ${hhmm}`);
  }
  const wallAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    Number(time[1]),
    Number(time[2]),
  );
  const firstGuess = wallAsUtc - timeZoneOffsetMs(new Date(wallAsUtc), timeZone);
  return new Date(wallAsUtc - timeZoneOffsetMs(new Date(firstGuess), timeZone));
}

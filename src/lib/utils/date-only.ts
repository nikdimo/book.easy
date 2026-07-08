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

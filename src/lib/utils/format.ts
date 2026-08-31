import { parseISO } from "date-fns";
import { Decimal } from "@prisma/client/runtime/library";
import {
  isValidYmd,
  nightsBetweenYmd,
  ymdToDbDate,
} from "@/lib/utils/date-only";

/* Constructing an Intl formatter costs far more than formatting with one, and these
 * run once per cell on list screens that render hundreds of rows. The combinations in
 * play are a handful of locale/currency pairs, so the instances are cached rather than
 * rebuilt per call. */
const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function currencyFormatter(locale: string, currency: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    numberFormatters.set(key, formatter);
  }
  return formatter;
}

function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

export function formatPrice(amount: number | Decimal | string, currency = "EUR", locale = "en"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : typeof amount === "number" ? amount : amount.toNumber();
  return currencyFormatter(locale, currency).format(num);
}

export function formatDate(date: Date | string, locale = "en"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return dateFormatter(locale, { year: "numeric", month: "short", day: "numeric" }).format(d);
}

export function formatDateShort(date: Date | string, locale = "en"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return dateFormatter(locale, { month: "short", day: "numeric" }).format(d);
}

export function formatDateRange(checkIn: Date | string, checkOut: Date | string, locale = "en"): string {
  return `${formatDateShort(checkIn, locale)} - ${formatDateShort(checkOut, locale)}`;
}

/**
 * Formats a stored calendar date without letting the reader's time zone rename it.
 *
 * Booking check-in/check-out and Prisma `@db.Date` values are days, not moments. They
 * are represented as UTC midnight only for storage and transport; formatting that
 * instant in Chicago turns June 10 into June 9. Pinning the formatter to UTC preserves
 * the calendar fields while still applying the reader's language and month names.
 * Use `formatDate` for real timestamps such as createdAt, submittedAt and deadlines.
 */
export function formatCalendarDate(
  date: Date | string,
  locale = "en",
): string {
  const value = calendarDateValue(date);
  return dateFormatter(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function formatCalendarDateShort(
  date: Date | string,
  locale = "en",
): string {
  const value = calendarDateValue(date);
  return dateFormatter(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function formatCalendarMonth(
  date: Date | string,
  locale = "en",
): string {
  const value = calendarDateValue(date);
  return dateFormatter(locale, { month: "short", timeZone: "UTC" }).format(value);
}

export function formatCalendarDay(
  date: Date | string,
  locale = "en",
): string {
  const value = calendarDateValue(date);
  return dateFormatter(locale, { day: "2-digit", timeZone: "UTC" }).format(value);
}

export function formatCalendarDateRange(
  checkIn: Date | string,
  checkOut: Date | string,
  locale = "en",
): string {
  return `${formatCalendarDateShort(checkIn, locale)} - ${formatCalendarDateShort(checkOut, locale)}`;
}

function calendarDateValue(date: Date | string): Date {
  if (typeof date !== "string") return date;
  // `parseISO("2026-06-10")` means local midnight. Formatting that in UTC can move
  // the value back to June 9 in zones east of UTC, so date-only strings need their
  // storage representation explicitly. Serialized Prisma dates already carry `Z`.
  return isValidYmd(date) ? ymdToDbDate(date) : parseISO(date);
}

/**
 * Nights in `[checkIn, checkOut)`, counted as calendar days.
 *
 * Not `differenceInDays`, which counts *local* days: over the UTC-midnight values a
 * `@db.Date` column reads back as, an autumn daylight-saving change makes the last day
 * look short and the count comes back one night low (M6). Dates are read the way the
 * rest of the calendar layer reads them — local fields, which is what a picker and
 * `parseLocalYmd` both produce.
 */
export function getNightCount(checkIn: Date | string, checkOut: Date | string): number {
  return nightsBetweenYmd(calendarDayKey(checkIn), calendarDayKey(checkOut));
}

function calendarDayKey(value: Date | string): string {
  if (typeof value === "string") {
    if (isValidYmd(value)) return value;
    return calendarDayKey(parseISO(value));
  }
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

export function formatGuestCount(count: number): string {
  return count === 1 ? "1 guest" : `${count} guests`;
}

export function formatBedroomCount(count: number): string {
  return count === 1 ? "1 bedroom" : `${count} bedrooms`;
}

export function formatBathroomCount(count: number): string {
  return count === 1 ? "1 bath" : `${count} baths`;
}

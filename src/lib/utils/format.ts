import { differenceInDays, parseISO } from "date-fns";
import { Decimal } from "@prisma/client/runtime/library";

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

export function getNightCount(checkIn: Date | string, checkOut: Date | string): number {
  const start = typeof checkIn === "string" ? parseISO(checkIn) : checkIn;
  const end = typeof checkOut === "string" ? parseISO(checkOut) : checkOut;
  return differenceInDays(end, start);
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

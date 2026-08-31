import { formatMoney } from "@/lib/currency/convert";
import { ymdToLocalDate } from "@/lib/utils/date-only";
import { LISTING } from "./fixtures";

/**
 * Display helpers for the prototype.
 *
 * The product formats prices through `LocalizedPrice`, which converts into the
 * visitor's chosen display currency from React context. The lab has no such choice to
 * read, so it calls the same `formatMoney` that component ends up in and shows the
 * listing's own currency — the shape of the string is identical.
 */

export function money(amount: number, currency = LISTING.currency): string {
  return formatMoney(amount, currency, LISTING.locale);
}

export function dayMonth(ymd: string): string {
  return new Intl.DateTimeFormat(LISTING.locale, {
    day: "numeric",
    month: "short",
  }).format(ymdToLocalDate(ymd));
}

export function dayMonthYear(ymd: string): string {
  return new Intl.DateTimeFormat(LISTING.locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(ymdToLocalDate(ymd));
}

export function weekdayDayMonth(ymd: string): string {
  return new Intl.DateTimeFormat(LISTING.locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(ymdToLocalDate(ymd));
}

/** "1 – 8 Jul", the form the booking summary already uses for a stay. */
export function stayRangeLabel(checkIn: string, checkOut: string): string {
  return `${dayMonth(checkIn)} – ${dayMonth(checkOut)}`;
}

/** "July 2026" — the heading a run of stays sits under. */
export function monthYear(monthKey: string): string {
  return new Intl.DateTimeFormat(LISTING.locale, {
    month: "long",
    year: "numeric",
  }).format(ymdToLocalDate(`${monthKey}-01`));
}

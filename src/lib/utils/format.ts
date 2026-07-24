import { differenceInDays, parseISO } from "date-fns";
import { Decimal } from "@prisma/client/runtime/library";

export function formatPrice(amount: number | Decimal | string, currency = "EUR", locale = "en"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : typeof amount === "number" ? amount : amount.toNumber();
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDate(date: Date | string, locale = "en"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(d);
}

export function formatDateShort(date: Date | string, locale = "en"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(d);
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

import { format, differenceInDays, parseISO } from "date-fns";
import { Decimal } from "@prisma/client/runtime/library";

export function formatPrice(amount: number | Decimal | string, currency = "EUR"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : typeof amount === "number" ? amount : amount.toNumber();
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy");
}

export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d");
}

export function formatDateRange(checkIn: Date | string, checkOut: Date | string): string {
  return `${formatDateShort(checkIn)} - ${formatDateShort(checkOut)}`;
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

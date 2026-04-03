import { format, eachDayOfInterval, addDays } from "date-fns";

export function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Nights are [checkIn, checkOut) — same convention as bookings. */
export function eachStayNight(checkIn: Date, checkOut: Date): Date[] {
  if (checkOut <= checkIn) return [];
  return eachDayOfInterval({ start: checkIn, end: addDays(checkOut, -1) });
}

export function buildPriceOverrideMap(rows: { date: Date; nightlyRate: unknown }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(dateKey(row.date), Number(row.nightlyRate));
  }
  return map;
}

export function computeStayPricing(
  baseNightly: number,
  checkIn: Date,
  checkOut: Date,
  overrides: Map<string, number>
): {
  nights: number;
  subtotal: number;
  averageNightly: number;
  nightlyBreakdown: { date: string; rate: number }[];
} {
  const nights = eachStayNight(checkIn, checkOut);
  const nightlyBreakdown = nights.map((d) => {
    const key = dateKey(d);
    const rate = overrides.has(key) ? overrides.get(key)! : baseNightly;
    return { date: key, rate };
  });
  const subtotal = nightlyBreakdown.reduce((sum, n) => sum + n.rate, 0);
  const n = nightlyBreakdown.length;
  return {
    nights: n,
    subtotal,
    averageNightly: n > 0 ? subtotal / n : 0,
    nightlyBreakdown,
  };
}

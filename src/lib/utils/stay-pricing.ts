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
  const subtotalCents = nightlyBreakdown.reduce(
    (sum, n) => sum + toCents(n.rate),
    0
  );
  const subtotal = fromCents(subtotalCents);
  const n = nightlyBreakdown.length;
  return {
    nights: n,
    subtotal,
    averageNightly: n > 0 ? subtotal / n : 0,
    nightlyBreakdown,
  };
}

export type StayPromotion = {
  id?: string;
  type: "PERCENT_DISCOUNT" | "FREE_CLEANING";
  discountPercent?: number | null;
  minimumNights?: number | null;
};

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(amount: number): number {
  return amount / 100;
}

/**
 * Complete guest-facing quote for the price types the product supports today.
 * Integer minor units are used for all arithmetic so the client preview and booking
 * transaction use the same rounding behavior.
 */
export function computeStayQuote({
  baseNightly,
  cleaningFee,
  checkIn,
  checkOut,
  overrides,
  promotion,
}: {
  baseNightly: number;
  cleaningFee: number;
  checkIn: Date;
  checkOut: Date;
  overrides: Map<string, number>;
  promotion?: StayPromotion | null;
}) {
  const stay = computeStayPricing(baseNightly, checkIn, checkOut, overrides);
  const accommodationCents = toCents(stay.subtotal);
  const cleaningCents = toCents(cleaningFee);
  const promotionEligible =
    Boolean(promotion) &&
    stay.nights > 0 &&
    stay.nights >= (promotion?.minimumNights ?? 1);

  let accommodationDiscountCents = 0;
  let cleaningDiscountCents = 0;

  if (
    promotionEligible &&
    promotion?.type === "PERCENT_DISCOUNT" &&
    promotion.discountPercent != null
  ) {
    accommodationDiscountCents = Math.round(
      (accommodationCents * promotion.discountPercent) / 100
    );
  } else if (promotionEligible && promotion?.type === "FREE_CLEANING") {
    cleaningDiscountCents = cleaningCents;
  }

  const discountCents =
    accommodationDiscountCents + cleaningDiscountCents;
  const originalTotalCents = accommodationCents + cleaningCents;
  const totalCents = originalTotalCents - discountCents;
  const discountedAccommodationCents =
    accommodationCents - accommodationDiscountCents;

  return {
    ...stay,
    originalAccommodationSubtotal: fromCents(accommodationCents),
    accommodationSubtotal: fromCents(discountedAccommodationCents),
    accommodationDiscount: fromCents(accommodationDiscountCents),
    originalCleaningFee: fromCents(cleaningCents),
    cleaningFee: fromCents(cleaningCents - cleaningDiscountCents),
    cleaningDiscount: fromCents(cleaningDiscountCents),
    originalTotal: fromCents(originalTotalCents),
    total: fromCents(totalCents),
    discountAmount: fromCents(discountCents),
    effectiveAverageNightly:
      stay.nights > 0
        ? fromCents(
            Math.round(discountedAccommodationCents / stay.nights)
          )
        : 0,
    promotionEligible,
    appliedPromotion: promotionEligible ? promotion ?? null : null,
  };
}

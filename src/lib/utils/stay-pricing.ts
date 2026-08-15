import { format, eachDayOfInterval, addDays, startOfDay } from "date-fns";

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

export function buildPriceOverrideMap(
  rows: { date: Date; nightlyRate: unknown }[],
): Map<string, number> {
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
  overrides: Map<string, number>,
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
    0,
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

export interface NightlyRateRange {
  min: number;
  max: number;
}

/**
 * The span of nightly rates a guest could actually book, used wherever a listing is
 * shown without dates. Only bookable nights count: a blocked night's rate is not on
 * offer, so including it would advertise a price the calendar refuses to sell. Nights
 * the host never overrode contribute the base rate, which is what they would be sold
 * at.
 */
export function computeNightlyRateRange({
  baseNightly,
  overrides,
  blockedRanges,
  from,
  to,
}: {
  baseNightly: number;
  overrides: Map<string, number>;
  /** Inclusive day ranges the calendar refuses — same shape the pickers consume. */
  blockedRanges: { from: Date; to: Date }[];
  from: Date;
  to: Date;
}): NightlyRateRange | null {
  const blocked = blockedRanges.map((range) => ({
    from: dateKey(range.from),
    to: dateKey(range.to),
  }));
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const day of eachDayOfInterval({ start: from, end: to })) {
    const key = dateKey(day);
    if (blocked.some((range) => key >= range.from && key <= range.to)) continue;
    const rate = overrides.get(key) ?? baseNightly;
    if (rate < min) min = rate;
    if (rate > max) max = rate;
  }

  return Number.isFinite(min) ? { min, max } : null;
}

export type StayPromotion = {
  id?: string;
  type: "PERCENT_DISCOUNT" | "FREE_CLEANING";
  discountPercent?: number | null;
  minimumNights?: number | null;
  freeCleaning?: boolean;
  roundToWholeUnit?: boolean;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  createdAt?: Date | string;
};

function promotionDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function selectApplicablePromotion(
  promotions: StayPromotion[],
  checkIn: Date,
  checkOut: Date,
  nights: number,
): StayPromotion | null {
  const eligible = promotions.filter((promotion) => {
    const minimumNights = promotion.minimumNights ?? 1;
    if (nights < minimumNights) return false;

    const startDate = promotionDate(promotion.startDate);
    const endDate = promotionDate(promotion.endDate);
    if (!startDate && !endDate) return true;
    if (!startDate || !endDate) return false;

    return checkIn >= startDate && checkOut <= endDate;
  });

  eligible.sort((left, right) => {
    const leftSpecific = left.startDate && left.endDate ? 1 : 0;
    const rightSpecific = right.startDate && right.endDate ? 1 : 0;
    if (leftSpecific !== rightSpecific) return rightSpecific - leftSpecific;

    const minimumDifference =
      (right.minimumNights ?? 1) - (left.minimumNights ?? 1);
    if (minimumDifference !== 0) return minimumDifference;

    const percentDifference =
      (right.discountPercent ?? 0) - (left.discountPercent ?? 0);
    if (percentDifference !== 0) return percentDifference;

    const leftCleaning =
      left.freeCleaning || left.type === "FREE_CLEANING" ? 1 : 0;
    const rightCleaning =
      right.freeCleaning || right.type === "FREE_CLEANING" ? 1 : 0;
    if (leftCleaning !== rightCleaning) return rightCleaning - leftCleaning;

    const leftCreated = promotionDate(left.createdAt)?.getTime() ?? 0;
    const rightCreated = promotionDate(right.createdAt)?.getTime() ?? 0;
    if (leftCreated !== rightCreated) return rightCreated - leftCreated;

    return (right.id ?? "").localeCompare(left.id ?? "");
  });

  return eligible[0] ?? null;
}

/**
 * What a single calendar day costs, and what it would have cost without a promotion.
 *
 * Only offers that apply to *any* stay length are reflected here. A "7+ nights" promo
 * is not a price this day can be booked at on its own, so striking through the rate on
 * the cell would advertise a discount most selections never qualify for — those stay
 * with the badge, which states their condition. `computeStayQuote` remains the only
 * thing that prices an actual stay; this never feeds a total.
 */
export function computeDayRate({
  baseNightly,
  overrides,
  day,
  promotions = [],
}: {
  baseNightly: number;
  overrides: Map<string, number>;
  day: Date;
  promotions?: StayPromotion[];
}): { rate: number; originalRate: number | null } {
  const original = overrides.get(dateKey(day)) ?? baseNightly;
  const target = startOfDay(day);

  const percentOff = promotions.reduce((best, promotion) => {
    const percent = promotion.discountPercent ?? 0;
    if (percent <= 0) return best;
    if ((promotion.minimumNights ?? 1) > 1) return best;

    const startDate = promotionDate(promotion.startDate);
    const endDate = promotionDate(promotion.endDate);
    // Mirrors selectApplicablePromotion: undated offers always apply, a half-dated
    // one never does, and a dated one only inside its own window.
    if (startDate || endDate) {
      if (!startDate || !endDate) return best;
      if (target < startOfDay(startDate) || target > startOfDay(endDate)) {
        return best;
      }
    }

    return percent > best.percent
      ? { percent, roundToWholeUnit: Boolean(promotion.roundToWholeUnit) }
      : best;
  }, { percent: 0, roundToWholeUnit: false });

  if (percentOff.percent <= 0) return { rate: original, originalRate: null };

  const originalCents = toCents(original);
  const discountedCents = Math.round(
    (originalCents * (100 - percentOff.percent)) / 100,
  );
  // Same rounding computeStayQuote bills at, so the cell and the quote agree.
  const chargedCents = percentOff.roundToWholeUnit
    ? Math.min(originalCents, Math.round(discountedCents / 100) * 100)
    : discountedCents;

  return chargedCents < originalCents
    ? { rate: fromCents(chargedCents), originalRate: original }
    : { rate: original, originalRate: null };
}

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
  promotions,
  promotion,
}: {
  baseNightly: number;
  cleaningFee: number;
  checkIn: Date;
  checkOut: Date;
  overrides: Map<string, number>;
  promotions?: StayPromotion[];
  /** @deprecated Pass promotions when more than one offer may be active. */
  promotion?: StayPromotion | null;
}) {
  const stay = computeStayPricing(baseNightly, checkIn, checkOut, overrides);
  const accommodationCents = toCents(stay.subtotal);
  const cleaningCents = toCents(cleaningFee);
  const applicablePromotion =
    stay.nights > 0
      ? selectApplicablePromotion(
          promotions ?? (promotion ? [promotion] : []),
          checkIn,
          checkOut,
          stay.nights,
        )
      : null;
  const promotionEligible = Boolean(applicablePromotion);

  let accommodationDiscountCents = 0;
  let cleaningDiscountCents = 0;

  const discountPercent = applicablePromotion?.discountPercent ?? 0;
  if (promotionEligible && discountPercent > 0) {
    if (applicablePromotion?.roundToWholeUnit) {
      accommodationDiscountCents = stay.nightlyBreakdown.reduce(
        (totalDiscount, night) => {
          const originalNightCents = toCents(night.rate);
          const discountedNightCents = Math.round(
            (originalNightCents * (100 - discountPercent)) / 100,
          );
          // Standard rounding to the nearest whole currency unit: below .50
          // rounds down, .50 and above rounds up. Capped at the original rate so
          // a discount can never make a night more expensive.
          const roundedNightCents = Math.min(
            originalNightCents,
            Math.round(discountedNightCents / 100) * 100,
          );
          return totalDiscount + originalNightCents - roundedNightCents;
        },
        0,
      );
    } else {
      accommodationDiscountCents = Math.round(
        (accommodationCents * discountPercent) / 100,
      );
    }
  }

  if (
    promotionEligible &&
    (applicablePromotion?.freeCleaning ||
      applicablePromotion?.type === "FREE_CLEANING")
  ) {
    cleaningDiscountCents = cleaningCents;
  }

  const discountCents = accommodationDiscountCents + cleaningDiscountCents;
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
        ? fromCents(Math.round(discountedAccommodationCents / stay.nights))
        : 0,
    promotionEligible,
    appliedPromotion: applicablePromotion,
  };
}

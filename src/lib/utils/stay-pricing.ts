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

function promotionHasFreeCleaning(promotion: StayPromotion): boolean {
  return Boolean(
    promotion.freeCleaning || promotion.type === "FREE_CLEANING",
  );
}

/** Stable ranking after eligibility: the bigger guest benefit wins. */
function comparePromotionBenefit(
  left: StayPromotion,
  right: StayPromotion,
): number {
  const percentDifference =
    (right.discountPercent ?? 0) - (left.discountPercent ?? 0);
  if (percentDifference !== 0) return percentDifference;

  const cleaningDifference =
    Number(promotionHasFreeCleaning(right)) -
    Number(promotionHasFreeCleaning(left));
  if (cleaningDifference !== 0) return cleaningDifference;

  const minimumDifference =
    (right.minimumNights ?? 1) - (left.minimumNights ?? 1);
  if (minimumDifference !== 0) return minimumDifference;

  const leftCreated = promotionDate(left.createdAt)?.getTime() ?? 0;
  const rightCreated = promotionDate(right.createdAt)?.getTime() ?? 0;
  if (leftCreated !== rightCreated) return rightCreated - leftCreated;

  return (right.id ?? "").localeCompare(left.id ?? "");
}

function promotionMeetsStayLength(
  promotion: StayPromotion,
  nights: number,
): boolean {
  return nights >= (promotion.minimumNights ?? 1);
}

/** Date ranges are [startDate, endDate), matching booking nights. */
export function promotionCoversNight(
  promotion: StayPromotion,
  night: Date,
): boolean {
  const startDate = promotionDate(promotion.startDate);
  const endDate = promotionDate(promotion.endDate);
  if (!startDate && !endDate) return true;
  if (!startDate || !endDate) return false;
  const target = startOfDay(night);
  return target >= startOfDay(startDate) && target < startOfDay(endDate);
}

/** The best eligible offer for one night of a longer booking. */
export function selectApplicablePromotionForNight(
  promotions: StayPromotion[],
  night: Date,
  stayNights: number,
): StayPromotion | null {
  return (
    promotions
      .filter(
        (promotion) =>
          promotionMeetsStayLength(promotion, stayNights) &&
          promotionCoversNight(promotion, night),
      )
      .sort(comparePromotionBenefit)[0] ?? null
  );
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

  eligible.sort(comparePromotionBenefit);

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

    if (!promotionCoversNight(promotion, target)) return best;

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
  const activePromotions = promotions ?? (promotion ? [promotion] : []);

  function nightDiscountCents(
    nightlyRate: number,
    applicable: StayPromotion | null,
  ): number {
    const percent = applicable?.discountPercent ?? 0;
    if (percent <= 0) return 0;
    const originalNightCents = toCents(nightlyRate);
    const discountedNightCents = Math.round(
      (originalNightCents * (100 - percent)) / 100,
    );
    const chargedNightCents = applicable?.roundToWholeUnit
      ? Math.min(
          originalNightCents,
          Math.round(discountedNightCents / 100) * 100,
        )
      : discountedNightCents;
    return originalNightCents - chargedNightCents;
  }

  const candidatesByNight = stay.nightlyBreakdown.map((night) => {
    const date = parseLocalYmd(night.date);
    return activePromotions.filter(
      (candidate) =>
        promotionMeetsStayLength(candidate, stay.nights) &&
        promotionCoversNight(candidate, date),
    );
  });
  const winners = candidatesByNight.map(
    (candidates) => [...candidates].sort(comparePromotionBenefit)[0] ?? null,
  );

  /**
   * Free cleaning is a booking-level benefit, while percentages are nightly. Start
   * with the best percentage on every night, then test whether assigning one eligible
   * night to a free-cleaning offer saves more overall after the lost nightly discount.
   * This keeps one offer per night and still makes "best" mean the most money saved.
   */
  const baselineDiscounts = stay.nightlyBreakdown.map((night, index) =>
    nightDiscountCents(night.rate, winners[index]),
  );
  let bestTotalSavings =
    baselineDiscounts.reduce((sum, value) => sum + value, 0) +
    (winners.some((winner) => winner && promotionHasFreeCleaning(winner))
      ? cleaningCents
      : 0);
  let forcedCleaningWinner: { candidate: StayPromotion; index: number } | null =
    null;

  if (!winners.some((winner) => winner && promotionHasFreeCleaning(winner))) {
    for (const candidate of activePromotions) {
      if (
        !promotionHasFreeCleaning(candidate) ||
        !promotionMeetsStayLength(candidate, stay.nights)
      ) {
        continue;
      }
      let cheapestIndex = -1;
      let cheapestLoss = Number.POSITIVE_INFINITY;
      for (let index = 0; index < stay.nightlyBreakdown.length; index += 1) {
        const night = stay.nightlyBreakdown[index];
        if (!promotionCoversNight(candidate, parseLocalYmd(night.date))) continue;
        const candidateDiscount = nightDiscountCents(night.rate, candidate);
        const loss = baselineDiscounts[index] - candidateDiscount;
        if (loss < cheapestLoss) {
          cheapestLoss = loss;
          cheapestIndex = index;
        }
      }
      if (cheapestIndex < 0) continue;
      const candidateTotal =
        baselineDiscounts.reduce((sum, value) => sum + value, 0) -
        cheapestLoss +
        cleaningCents;
      if (candidateTotal > bestTotalSavings) {
        forcedCleaningWinner = { candidate, index: cheapestIndex };
        bestTotalSavings = candidateTotal;
      }
    }
  }
  if (forcedCleaningWinner) {
    winners[forcedCleaningWinner.index] = forcedCleaningWinner.candidate;
  }

  const nightlyBreakdown = stay.nightlyBreakdown.map((night, index) => {
    const winner = winners[index];
    const discountCents = nightDiscountCents(night.rate, winner);
    return {
      ...night,
      originalRate: night.rate,
      discountedRate: fromCents(toCents(night.rate) - discountCents),
      discountAmount: fromCents(discountCents),
      promotionId: winner?.id ?? null,
    };
  });
  const accommodationDiscountCents = nightlyBreakdown.reduce(
    (sum, night) => sum + toCents(night.discountAmount),
    0,
  );
  const appliedPromotions = winners.filter(
    (winner, index): winner is StayPromotion =>
      Boolean(winner) && winners.indexOf(winner) === index,
  );
  const cleaningPromotion = appliedPromotions.find(promotionHasFreeCleaning) ?? null;
  const cleaningDiscountCents = cleaningPromotion ? cleaningCents : 0;
  const promotionEligible = appliedPromotions.length > 0;

  const contributionByPromotion = new Map<StayPromotion, number>();
  winners.forEach((winner, index) => {
    if (!winner) return;
    contributionByPromotion.set(
      winner,
      (contributionByPromotion.get(winner) ?? 0) +
        toCents(nightlyBreakdown[index].discountAmount),
    );
  });
  if (cleaningPromotion) {
    contributionByPromotion.set(
      cleaningPromotion,
      (contributionByPromotion.get(cleaningPromotion) ?? 0) + cleaningCents,
    );
  }
  const applicablePromotion =
    [...appliedPromotions].sort(
      (left, right) =>
        (contributionByPromotion.get(right) ?? 0) -
          (contributionByPromotion.get(left) ?? 0) ||
        comparePromotionBenefit(left, right),
    )[0] ?? null;

  const discountCents = accommodationDiscountCents + cleaningDiscountCents;
  const originalTotalCents = accommodationCents + cleaningCents;
  const totalCents = originalTotalCents - discountCents;
  const discountedAccommodationCents =
    accommodationCents - accommodationDiscountCents;

  return {
    ...stay,
    nightlyBreakdown,
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
    appliedPromotions,
  };
}

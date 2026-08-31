import {
  compareYmd,
  dbDateToYmd,
  eachYmdExclusive,
  eachYmdInclusive,
  isValidYmd,
  ymdToLocalDate,
} from "@/lib/utils/date-only";

/**
 * **Every `Date` in this module is a calendar date held in *local* fields.**
 *
 * That is one rule, and it is the one the pickers already produce: react-day-picker
 * hands back local midnight, `parseLocalYmd` builds local midnight, and `dateKey`
 * reads local fields back out. A ymd that goes in comes out unchanged in any zone,
 * because both ends read the same clock.
 *
 * The flavour that must *not* reach these functions is a Prisma `@db.Date` value.
 * Those come back as UTC midnight, which on a server or browser behind UTC is the
 * previous calendar day locally — so a June 10 override would be keyed "2026-06-09"
 * and priced onto the wrong night. Convert at the boundary instead:
 *
 * - a key:  `dbDateToYmd(row.date)`
 * - a Date: `dbDateToLocalDate(row.date)`
 * - a whole promotion row: `toStayPromotion(row)` below
 *
 * Arithmetic runs on `yyyy-MM-dd` strings rather than on `Date`s, so nothing here can
 * drift across a daylight-saving change either (see `eachYmdExclusive`).
 */
export function parseLocalYmd(ymd: string): Date {
  // Deliberately lenient about anything that is not a well-formed date-only value:
  // callers pass user-supplied and legacy strings here and rely on getting an Invalid
  // Date back rather than a throw.
  if (!isValidYmd(ymd)) return new Date(Number.NaN);
  return ymdToLocalDate(ymd);
}

export function dateKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * `dateKey`, or null for a date that is not one.
 *
 * `parseLocalYmd` hands back an Invalid Date for the garbage that reaches it from
 * edited URLs and stale links, and the day walkers below step a `yyyy-MM-dd` cursor
 * until it passes an end key — which a "NaN-NaN-NaN" end never is. Refusing the
 * value here is what keeps that a no-op rather than a hung render.
 */
function dateKeyOrNull(d: Date): string | null {
  return Number.isNaN(d.getTime()) ? null : dateKey(d);
}

/** Nights are [checkIn, checkOut) — same convention as bookings. */
export function eachStayNight(checkIn: Date, checkOut: Date): Date[] {
  return eachStayNightKey(checkIn, checkOut).map(parseLocalYmd);
}

/** The same nights as `eachStayNight`, as the keys everything here is indexed by. */
export function eachStayNightKey(checkIn: Date, checkOut: Date): string[] {
  const start = dateKeyOrNull(checkIn);
  const end = dateKeyOrNull(checkOut);
  if (start === null || end === null) return [];
  return eachYmdExclusive(start, end);
}

/**
 * Nightly overrides keyed by the calendar date they are stored against.
 *
 * `date` is a `@db.Date` column, so its UTC fields — not the server's local reading of
 * them — are the day the host set the price for.
 */
export function buildPriceOverrideMap(
  rows: { date: Date; nightlyRate: unknown }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(dbDateToYmd(row.date), Number(row.nightlyRate));
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
  const nightlyBreakdown = eachStayNightKey(checkIn, checkOut).map((key) => {
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
 * An inclusive run of calendar days, as either a date-only key or a local-fields
 * `Date`. Blocked ranges reach here both ways — as keys from the availability service,
 * and as the `Date`s a picker already holds — and both mean the same day.
 */
export type CalendarDayRange = { from: Date | string; to: Date | string };

function dayKeyOf(value: Date | string): string {
  return typeof value === "string" ? value : dateKey(value);
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
  /** Inclusive day ranges the calendar refuses — same shape the pickers consume,
   *  in either flavour a caller holds them in (see `dayKeyOf`). */
  blockedRanges: CalendarDayRange[];
  from: Date;
  to: Date;
}): NightlyRateRange | null {
  const blocked = blockedRanges.map((range) => ({
    from: dayKeyOf(range.from),
    to: dayKeyOf(range.to),
  }));
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  const fromKey = dateKeyOrNull(from);
  const toKey = dateKeyOrNull(to);
  if (fromKey === null || toKey === null) return null;

  for (const key of eachYmdInclusive(fromKey, toKey)) {
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

/**
 * One end of a promotion window, as a calendar-date key.
 *
 * A `Date` is already in this module's convention (local fields — see the note at the
 * top), so it is read locally. A *string* is the serialized form of a `@db.Date`
 * column — either `"2026-06-10"` or the `"2026-06-10T00:00:00.000Z"` an ISO round-trip
 * produces — so its UTC fields are the stored day, whatever zone the reader is in.
 * That is what lets a promotion window survive the trip from the server to a browser
 * in Chicago without moving a day.
 */
function promotionDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return dateKeyOrNull(value);
  return storedDayKey(value);
}

/** `createdAt` is a moment, not a calendar date — it only ever breaks a tie. */
function promotionInstant(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * A stored promotion row as a `StayPromotion`.
 *
 * `startDate`/`endDate` are `@db.Date` columns, so Prisma hands them back as UTC
 * midnight — the one flavour this module must not be given raw. Carrying them as
 * date-only keys is also what makes them safe to hand to a client component: a `Date`
 * crosses the server/client boundary as an *instant*, and a browser behind UTC would
 * read that instant as the day before.
 */
export function toStayPromotion(row: {
  id?: string;
  type: "PERCENT_DISCOUNT" | "FREE_CLEANING";
  discountPercent?: number | null;
  minimumNights?: number | null;
  freeCleaning?: boolean;
  roundToWholeUnit?: boolean;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  createdAt?: Date | string;
}): StayPromotion {
  return {
    ...row,
    startDate: storedDayKey(row.startDate),
    endDate: storedDayKey(row.endDate),
  };
}

/** The calendar day a `@db.Date` value holds, read from its UTC fields. */
function storedDayKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  try {
    return dbDateToYmd(value);
  } catch {
    return null;
  }
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

  const leftCreated = promotionInstant(left.createdAt)?.getTime() ?? 0;
  const rightCreated = promotionInstant(right.createdAt)?.getTime() ?? 0;
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
  return promotionCoversNightKey(promotion, dateKey(night));
}

/** The same window test against a night that is already a calendar-date key. */
export function promotionCoversNightKey(
  promotion: StayPromotion,
  nightKey: string,
): boolean {
  const startKey = promotionDateKey(promotion.startDate);
  const endKey = promotionDateKey(promotion.endDate);
  if (!startKey && !endKey) return true;
  if (!startKey || !endKey) return false;
  return compareYmd(nightKey, startKey) >= 0 && compareYmd(nightKey, endKey) < 0;
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

    const startKey = promotionDateKey(promotion.startDate);
    const endKey = promotionDateKey(promotion.endDate);
    if (!startKey && !endKey) return true;
    if (!startKey || !endKey) return false;

    return (
      compareYmd(dateKey(checkIn), startKey) >= 0 &&
      compareYmd(dateKey(checkOut), endKey) <= 0
    );
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
  const target = dateKey(day);
  const original = overrides.get(target) ?? baseNightly;

  const percentOff = promotions.reduce((best, promotion) => {
    const percent = promotion.discountPercent ?? 0;
    if (percent <= 0) return best;
    if ((promotion.minimumNights ?? 1) > 1) return best;

    if (!promotionCoversNightKey(promotion, target)) return best;

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

  const candidatesByNight = stay.nightlyBreakdown.map((night) =>
    activePromotions.filter(
      (candidate) =>
        promotionMeetsStayLength(candidate, stay.nights) &&
        promotionCoversNightKey(candidate, night.date),
    ),
  );
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
        if (!promotionCoversNightKey(candidate, night.date)) continue;
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

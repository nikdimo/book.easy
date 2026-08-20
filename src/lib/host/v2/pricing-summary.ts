import { compareYmd } from "@/lib/utils/date-only";

/**
 * The read-only shape behind the editor's Pricing section.
 *
 * Prices are changed in Calendar and nowhere else, so nothing here validates or
 * normalises a value — it only says what the listing currently charges. Keeping the
 * arithmetic in this pure module means the classification below can be unit tested
 * without a database or a translator, exactly like the calendar model next to it.
 */

export type PromotionPhase = "ACTIVE" | "UPCOMING" | "PAST";

export interface PricingSummaryRule {
  currency: string;
  baseNightlyRate: number;
  cleaningFee: number;
  minNights: number;
  maxNights: number;
}

export interface PricingSummaryPromotionInput {
  id: string;
  type: "PERCENT_DISCOUNT" | "FREE_CLEANING";
  discountPercent: number;
  minimumNights: number | null;
  freeCleaning: boolean;
  /** Date-only `YYYY-MM-DD`; null means the offer has no start or no end. */
  startDate: string | null;
  endDate: string | null;
}

export interface PricingSummaryPromotion extends PricingSummaryPromotionInput {
  phase: PromotionPhase;
}

export interface PricingSummaryInput {
  listingId: string;
  rule: PricingSummaryRule | null;
  /** Only offers the host has not disabled. */
  promotions: PricingSummaryPromotionInput[];
  /** Date-specific nightly rates from today onwards, ascending. */
  datePriceDates: string[];
}

export interface ListingPricingSummary {
  listingId: string;
  /** Null when the listing has no PricingRule row yet — a listing can exist before
   *  anyone has opened Calendar for it, and this page has to survive that. */
  rule: PricingSummaryRule | null;
  /** Everything still relevant: running today or starting later. Past offers are
   *  dropped, because a summary of what the listing charges now should not be padded
   *  with offers that can no longer apply to a booking. */
  promotions: PricingSummaryPromotion[];
  activePromotionCount: number;
  upcomingPromotionCount: number;
  /** How many upcoming nights carry a price of their own. */
  datePriceCount: number;
  /** First and last of those nights, or null when there are none. */
  datePriceRange: { from: string; to: string } | null;
}

/**
 * Where an offer sits relative to today. An open-ended offer (no dates at all) is
 * always active: that is how the calendar's quote engine treats it, and the two must
 * not disagree about whether a guest can currently get the discount.
 */
export function promotionPhase(
  promotion: Pick<PricingSummaryPromotionInput, "startDate" | "endDate">,
  today: string,
): PromotionPhase {
  // Calendar stores the end as an exclusive boundary. On that date the promotion has
  // already finished, matching quote calculation and the Calendar's own summaries.
  if (promotion.endDate && compareYmd(promotion.endDate, today) <= 0) return "PAST";
  if (promotion.startDate && compareYmd(promotion.startDate, today) > 0) return "UPCOMING";
  return "ACTIVE";
}

export function summarizePricing(
  input: PricingSummaryInput,
  today: string,
): ListingPricingSummary {
  const promotions = input.promotions
    .map((promotion) => ({ ...promotion, phase: promotionPhase(promotion, today) }))
    .filter((promotion) => promotion.phase !== "PAST");

  // Sorted the way a host reads them: what applies now, then what is coming, and
  // within each group the one that starts soonest. Undated offers lead their group
  // because they are the listing's standing terms.
  promotions.sort((a, b) => {
    if (a.phase !== b.phase) return a.phase === "ACTIVE" ? -1 : 1;
    if (a.startDate && b.startDate) return compareYmd(a.startDate, b.startDate);
    if (a.startDate) return 1;
    if (b.startDate) return -1;
    return 0;
  });

  const dates = [...input.datePriceDates].sort(compareYmd);

  return {
    listingId: input.listingId,
    rule: input.rule,
    promotions,
    activePromotionCount: promotions.filter((p) => p.phase === "ACTIVE").length,
    upcomingPromotionCount: promotions.filter((p) => p.phase === "UPCOMING").length,
    datePriceCount: dates.length,
    datePriceRange:
      dates.length > 0
        ? { from: dates[0], to: dates[dates.length - 1] }
        : null,
  };
}

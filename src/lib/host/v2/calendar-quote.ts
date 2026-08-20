import type {
  HostCalendarListing,
  HostCalendarPromotion,
} from "@/lib/host/v2/calendar-types";
import type { CalendarSelection } from "@/lib/host/v2/calendar-selection";
import { selectionDates, selectionRange } from "@/lib/host/v2/calendar-selection";
import { computeCalendarPromotionPreview } from "@/lib/host/calendar-promotion-preview";
import {
  computeStayQuote,
  parseLocalYmd,
  promotionCoversNight,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";

/**
 * The nightly price the host is proposing for every selected date.
 * `RESET` means "drop the override and fall back to the base price".
 */
export type ProposedNightlyRate =
  | { mode: "SET"; value: number }
  | { mode: "RESET" }
  | null;

export interface ProposedPromotion {
  promotionId?: string;
  discountPercent: number;
  minimumNights: number;
  freeCleaning: boolean;
  roundToWholeUnit: boolean;
}

/** Promotions in the payload are civil dates; the quote engine compares local Dates. */
function toStayPromotions(
  promotions: HostCalendarPromotion[],
): StayPromotion[] {
  return promotions.map((promotion) => ({
    id: promotion.id,
    type: promotion.type,
    discountPercent: promotion.discountPercent,
    minimumNights: promotion.minimumNights,
    freeCleaning: promotion.freeCleaning,
    roundToWholeUnit: promotion.roundToWholeUnit,
    startDate: promotion.startDate ? parseLocalYmd(promotion.startDate) : null,
    endDate: promotion.endDate ? parseLocalYmd(promotion.endDate) : null,
    createdAt: promotion.createdAt,
  }));
}

/**
 * The date-price overrides that would be in force after the proposed edit — built the
 * same way the mutation builds them, so the preview and the save cannot disagree.
 */
export function overridesAfterProposal(
  listing: HostCalendarListing,
  dates: string[],
  proposed: ProposedNightlyRate,
): Map<string, number> {
  const overrides = new Map<string, number>(
    listing.datePrices.map((row) => [row.date, row.nightlyRate]),
  );
  if (!proposed) return overrides;
  for (const date of dates) {
    if (proposed.mode === "RESET") overrides.delete(date);
    else overrides.set(date, proposed.value);
  }
  return overrides;
}

export type SelectionQuote = ReturnType<typeof computeStayQuote>;

export interface SelectionPromotionSummary {
  promotion: HostCalendarPromotion;
  /** Selected nights inside this promotion's date scope, before stay eligibility. */
  coveredNights: number;
  /** Selected nights where this promotion produces the best guest price. */
  winningNights: number;
}

/** Existing promotions touching a selection, with the nights each one actually wins. */
export function selectionPromotionSummaries(
  listing: HostCalendarListing,
  selection: CalendarSelection,
): SelectionPromotionSummary[] {
  const dates = selectionDates(selection);
  if (dates.length === 0) return [];
  const quote = computeSelectionQuote({ listing, selection });
  const winningById = new Map<string, number>();
  for (const night of quote?.nightlyBreakdown ?? []) {
    if (!night.promotionId) continue;
    winningById.set(
      night.promotionId,
      (winningById.get(night.promotionId) ?? 0) + 1,
    );
  }

  return listing.promotions
    .map((promotion) => {
      const stayPromotion = toStayPromotions([promotion])[0];
      const coveredNights = dates.filter((date) =>
        promotionCoversNight(stayPromotion, parseLocalYmd(date)),
      ).length;
      return {
        promotion,
        coveredNights,
        winningNights: winningById.get(promotion.id) ?? 0,
      };
    })
    .filter((summary) => summary.coveredNights > 0)
    .sort(
      (left, right) =>
        right.winningNights - left.winningNights ||
        right.promotion.discountPercent - left.promotion.discountPercent ||
        left.promotion.id.localeCompare(right.promotion.id),
    );
}

/**
 * The promotion contributing the most savings to a booking of exactly these dates.
 * Other promotions may win different nights; this singular helper is retained for
 * edit defaults and compact summaries that have room for one result.
 */
export function resolveSelectionPromotion(
  listing: HostCalendarListing,
  selection: CalendarSelection,
): HostCalendarPromotion | null {
  if (selectionDates(selection).length === 0 || listing.promotions.length === 0) {
    return null;
  }
  const applicable = computeSelectionQuote({ listing, selection })?.appliedPromotion;
  if (!applicable?.id) return null;
  return (
    listing.promotions.find((promotion) => promotion.id === applicable.id) ??
    null
  );
}

/**
 * What saving a new offer for these dates would do to the one already in force.
 *
 * - `CREATE` — nothing applies today.
 * - `EDIT` — a dated promotion covers exactly this range, so it is updated in place.
 * - `OVERRIDE` — an offer affects the selection but does not exactly match its range.
 *   Saving creates a separate dated promotion; both remain available and the pricing
 *   engine chooses the best guest savings on each night.
 */
export type PromotionSaveMode = "CREATE" | "EDIT" | "OVERRIDE";

export function promotionSaveMode(
  existing: HostCalendarPromotion | null,
  selection: CalendarSelection,
): PromotionSaveMode {
  if (!existing) return "CREATE";
  const { startDate, endDate } = selectionRange(selection);
  const coversExactly =
    existing.startDate === startDate && existing.endDate === endDate;
  return coversExactly ? "EDIT" : "OVERRIDE";
}

/**
 * What a guest booking exactly these dates would pay.
 *
 * Everything financial goes through `computeStayQuote` — the same function the booking
 * transaction prices with — so promotion selection, whole-unit rounding, cleaning
 * waivers and the discounted average are not re-implemented here. Returns null when
 * the listing has no pricing, because there is then no honest number to show.
 */
export function computeSelectionQuote({
  listing,
  selection,
  proposedNightlyRate = null,
  proposedPromotion = null,
}: {
  listing: HostCalendarListing;
  selection: CalendarSelection;
  proposedNightlyRate?: ProposedNightlyRate;
  proposedPromotion?: ProposedPromotion | null;
}): SelectionQuote | null {
  const pricing = listing.pricing;
  if (!pricing) return null;

  const dates = selectionDates(selection);
  if (dates.length === 0) return null;
  const { startDate, endDate } = selectionRange(selection);

  if (proposedPromotion) {
    // The promotion preview owns the "replace the edited offer, keep the rest"
    // rule; duplicating it here is exactly the drift this workspace must avoid.
    const overrides = overridesAfterProposal(
      listing,
      dates,
      proposedNightlyRate,
    );
    return computeCalendarPromotionPreview({
      baseNightlyRate: pricing.baseNightlyRate,
      cleaningFee: pricing.cleaningFee,
      startDate,
      endDate,
      datePrices: [...overrides].map(([date, nightlyRate]) => ({
        date: parseLocalYmd(date),
        nightlyRate,
      })),
      promotions: toStayPromotions(listing.promotions),
      proposal: proposedPromotion,
    }).quote;
  }

  return computeStayQuote({
    baseNightly: pricing.baseNightlyRate,
    cleaningFee: pricing.cleaningFee,
    checkIn: parseLocalYmd(startDate),
    checkOut: parseLocalYmd(endDate),
    overrides: overridesAfterProposal(listing, dates, proposedNightlyRate),
    promotions: toStayPromotions(listing.promotions),
  });
}

/**
 * Whether a stay of exactly these dates is one a guest could really request.
 *
 * A quote for four nights on a listing with a seven-night minimum is a number no guest
 * will ever be shown, so the workbench labels it rather than presenting it as the
 * guest's total.
 */
export function meetsMinimumStay(
  listing: HostCalendarListing,
  selection: CalendarSelection,
): boolean {
  const minNights = listing.pricing?.minNights ?? 1;
  return selectionDates(selection).length >= minNights;
}

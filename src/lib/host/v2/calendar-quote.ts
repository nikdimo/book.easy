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
  selectApplicablePromotion,
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

/**
 * Which promotion a guest booking exactly these dates would actually get.
 *
 * Uses `selectApplicablePromotion` — the same priority rules the booking transaction
 * applies — rather than asking whether a promotion happens to overlap. Without this the
 * editor claimed "No promotion" on dates covered by an always-active offer, and would
 * then have presented a new offer as if it were the first one.
 */
export function resolveSelectionPromotion(
  listing: HostCalendarListing,
  selection: CalendarSelection,
): HostCalendarPromotion | null {
  const dates = selectionDates(selection);
  if (dates.length === 0 || listing.promotions.length === 0) return null;
  const { startDate, endDate } = selectionRange(selection);
  const applicable = selectApplicablePromotion(
    toStayPromotions(listing.promotions),
    parseLocalYmd(startDate),
    parseLocalYmd(endDate),
    dates.length,
  );
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
 * - `OVERRIDE` — an offer applies but is not this range's own (an always-active one, or
 *   a dated one with different bounds). A date-specific promotion takes priority over
 *   it for these dates; it keeps running everywhere else.
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

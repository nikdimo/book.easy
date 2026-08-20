import { addDaysToYmd, dbDateToYmd } from "@/lib/utils/date-only";
import {
  computeStayQuote,
  parseLocalYmd,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";

export interface PromotionPreviewDatePrice {
  date: Date | string;
  nightlyRate: number;
}

export interface PromotionPreviewProposal {
  promotionId?: string;
  discountPercent: number;
  minimumNights: number;
  freeCleaning: boolean;
  roundToWholeUnit: boolean;
}

/**
 * Builds the same selected-stay quote the booking transaction will build.
 *
 * Calendar dates are civil dates. Existing database dates are therefore normalized
 * through YYYY-MM-DD before becoming local Dates, instead of comparing UTC midnight
 * with a host browser's local midnight and moving an offer at timezone boundaries.
 */
export function computeCalendarPromotionPreview({
  baseNightlyRate,
  cleaningFee,
  startDate,
  endDate,
  datePrices,
  promotions,
  proposal,
}: {
  baseNightlyRate: number;
  cleaningFee: number;
  /** Inclusive first selected night, YYYY-MM-DD. */
  startDate: string;
  /** Exclusive checkout boundary, YYYY-MM-DD. */
  endDate: string;
  datePrices: PromotionPreviewDatePrice[];
  promotions: StayPromotion[];
  proposal: PromotionPreviewProposal;
}) {
  const previewPromotionId = proposal.promotionId ?? "calendar-preview-proposal";
  const checkIn = parseLocalYmd(startDate);
  const checkOut = parseLocalYmd(endDate);
  const overrides = new Map(
    datePrices.map((row) => [dbDateToYmd(row.date), Number(row.nightlyRate)]),
  );

  // Editing replaces the existing row in the preview, just as the save replaces it
  // in the database. Keeping both would let the stale version win priority sorting.
  const activePromotions = promotions
    .filter((promotion) => promotion.id !== proposal.promotionId)
    .map(normalizePromotionDates);
  activePromotions.push({
    id: previewPromotionId,
    type:
      proposal.discountPercent > 0 ? "PERCENT_DISCOUNT" : "FREE_CLEANING",
    discountPercent: proposal.discountPercent,
    minimumNights: proposal.minimumNights,
    freeCleaning: proposal.freeCleaning,
    roundToWholeUnit:
      proposal.discountPercent > 0 && proposal.roundToWholeUnit,
    startDate: checkIn,
    endDate: checkOut,
    createdAt: new Date(8640000000000000),
  });

  const quote = computeStayQuote({
    baseNightly: baseNightlyRate,
    cleaningFee,
    checkIn,
    checkOut,
    overrides,
    promotions: activePromotions,
  });

  return {
    quote,
    proposedPromotionApplied:
      quote.appliedPromotions.some(
        (promotion) => promotion.id === previewPromotionId,
      ),
  };
}

/** A clearly-labelled illustration for an evergreen offer. It intentionally uses
 * only the base rate: without dates there is no honest way to choose date overrides
 * or promise an actual guest total. Pricing math still goes through the booking
 * quote engine so rounding and cleaning waivers remain exact. */
export function computeEvergreenPromotionBaseExample({
  baseNightlyRate,
  cleaningFee,
  nights,
  proposal,
}: {
  baseNightlyRate: number;
  cleaningFee: number;
  nights: number;
  proposal: Omit<PromotionPreviewProposal, "promotionId">;
}) {
  const safeNights = Number.isInteger(nights) && nights > 0 ? nights : 1;
  const startDate = "2030-01-01";
  const endDate = addDaysToYmd(startDate, safeNights);
  return computeStayQuote({
    baseNightly: baseNightlyRate,
    cleaningFee,
    checkIn: parseLocalYmd(startDate),
    checkOut: parseLocalYmd(endDate),
    overrides: new Map(),
    promotions: [
      {
        id: "calendar-evergreen-example",
        type:
          proposal.discountPercent > 0
            ? "PERCENT_DISCOUNT"
            : "FREE_CLEANING",
        discountPercent: proposal.discountPercent,
        minimumNights: safeNights,
        freeCleaning: proposal.freeCleaning,
        roundToWholeUnit:
          proposal.discountPercent > 0 && proposal.roundToWholeUnit,
      },
    ],
  });
}

function normalizePromotionDates(promotion: StayPromotion): StayPromotion {
  const startDate = promotion.startDate
    ? parseLocalYmd(dbDateToYmd(promotion.startDate))
    : null;
  const endDate = promotion.endDate
    ? parseLocalYmd(dbDateToYmd(promotion.endDate))
    : null;
  return { ...promotion, startDate, endDate };
}

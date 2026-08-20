import "server-only";
import { db } from "@/lib/db";
import { PUBLIC_AVAILABILITY_HORIZON_MONTHS } from "@/lib/services/availability.service";
import {
  summarizePricing,
  type ListingPricingSummary,
  type PricingSummaryPromotionInput,
} from "@/lib/host/v2/pricing-summary";
import { dbDateToYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";

/**
 * What the listing currently charges, for the editor's read-only Pricing section.
 *
 * Authorization is the query: the listing is reached through `hostId`, so one that is
 * not this host's comes back as `null` — "not found" — rather than leaking that it
 * exists. This is a read and grants nothing; every price change still happens in
 * Calendar, through its own actions.
 *
 * The date-price window matches the guest-facing availability horizon so this page and
 * the calendar can never disagree about whether a listing has date-specific prices.
 */
export async function getListingPricingSummary(
  listingId: string,
  hostId: string,
): Promise<ListingPricingSummary | null> {
  const today = todayYmd();
  const todayDate = ymdToDbDate(today);
  const horizonDate = ymdToDbDate(today);
  horizonDate.setUTCMonth(horizonDate.getUTCMonth() + PUBLIC_AVAILABILITY_HORIZON_MONTHS);

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: {
      id: true,
      pricingRule: {
        select: {
          currency: true,
          baseNightlyRate: true,
          cleaningFee: true,
          minNights: true,
          maxNights: true,
        },
      },
      promotions: {
        where: { disabledAt: null },
        orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          type: true,
          discountPercent: true,
          minimumNights: true,
          freeCleaning: true,
          startDate: true,
          endDate: true,
        },
      },
      datePrices: {
        where: { date: { gte: todayDate, lt: horizonDate } },
        orderBy: { date: "asc" },
        select: { date: true },
      },
    },
  });

  if (!listing) return null;

  return summarizePricing(
    {
      listingId: listing.id,
      // A listing can exist before anyone has opened Calendar for it, so the rule is
      // genuinely optional rather than a defect to paper over with zeroes.
      rule: listing.pricingRule
        ? {
            currency: listing.pricingRule.currency,
            baseNightlyRate: Number(listing.pricingRule.baseNightlyRate),
            cleaningFee: Number(listing.pricingRule.cleaningFee),
            minNights: listing.pricingRule.minNights,
            maxNights: listing.pricingRule.maxNights,
          }
        : null,
      promotions: listing.promotions.map(
        (promotion): PricingSummaryPromotionInput => ({
          id: promotion.id,
          type: promotion.type,
          discountPercent: promotion.discountPercent,
          minimumNights: promotion.minimumNights,
          freeCleaning: promotion.freeCleaning,
          startDate: promotion.startDate ? dbDateToYmd(promotion.startDate) : null,
          endDate: promotion.endDate ? dbDateToYmd(promotion.endDate) : null,
        }),
      ),
      datePriceDates: listing.datePrices.map((row) => dbDateToYmd(row.date)),
    },
    today,
  );
}

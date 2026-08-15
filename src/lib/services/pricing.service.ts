import "server-only";
import { addDays } from "date-fns";
import { db } from "@/lib/db";
import { getBlockedDateRangesForListings } from "@/lib/services/availability.service";
import {
  computeNightlyRateRange,
  dateKey,
  type NightlyRateRange,
} from "@/lib/utils/stay-pricing";

export {
  parseLocalYmd,
  dateKey,
  eachStayNight,
  buildPriceOverrideMap,
  computeStayPricing,
} from "@/lib/utils/stay-pricing";

export async function getListingDatePricesFromDb(listingId: string, from: Date, to: Date) {
  return db.listingDatePrice.findMany({
    where: {
      listingId,
      date: { gte: from, lt: to },
    },
    orderBy: { date: "asc" },
  });
}

/** How far ahead a dateless listing quotes its nightly range. A year covers a full
 * season cycle, so the low end is a price the guest can still plan a trip around. */
const RATE_RANGE_HORIZON_MONTHS = 12;

/**
 * The span of nightly rates each listing is currently offering, for the cards that are
 * shown before a guest has picked dates. Blocked nights are excluded — see
 * computeNightlyRateRange — which is why this needs availability and not just prices.
 */
export async function getNightlyRateRangesForListings(
  listings: { id: string; baseNightlyRate: number }[]
): Promise<Map<string, NightlyRateRange>> {
  const ranges = new Map<string, NightlyRateRange>();
  if (listings.length === 0) return ranges;

  const listingIds = listings.map((listing) => listing.id);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setMonth(to.getMonth() + RATE_RANGE_HORIZON_MONTHS);

  const [datePrices, blockedByListing] = await Promise.all([
    db.listingDatePrice.findMany({
      where: { listingId: { in: listingIds }, date: { gte: from, lte: to } },
      select: { listingId: true, date: true, nightlyRate: true },
    }),
    getBlockedDateRangesForListings(listingIds),
  ]);

  const overridesByListing = new Map<string, Map<string, number>>();
  for (const row of datePrices) {
    const overrides = overridesByListing.get(row.listingId) ?? new Map();
    overrides.set(dateKey(row.date), Number(row.nightlyRate));
    overridesByListing.set(row.listingId, overrides);
  }

  for (const listing of listings) {
    const range = computeNightlyRateRange({
      baseNightly: listing.baseNightlyRate,
      overrides: overridesByListing.get(listing.id) ?? new Map(),
      blockedRanges: blockedByListing.get(listing.id) ?? [],
      from,
      to,
    });
    if (range) ranges.set(listing.id, range);
  }

  return ranges;
}

export async function getFutureDatePriceRowsForListing(listingId: string, monthsAhead = 18) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = addDays(from, monthsAhead * 31);
  return db.listingDatePrice.findMany({
    where: {
      listingId,
      date: { gte: from, lte: to },
    },
    select: { id: true, date: true, nightlyRate: true },
    orderBy: { date: "asc" },
  });
}

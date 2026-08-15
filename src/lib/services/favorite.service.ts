import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import {
  listingCardSelect,
  serializeListingCard,
  getFirstVideoUrlsByListingIds,
} from "@/lib/serializers/listing-card";
import { getNightlyRateRangesForListings } from "@/lib/services/pricing.service";

/** Deduped per-request: many PropertyCards render in one page pass, and they all need
 *  the same user's favorite set — cache() collapses that to a single query per request
 *  instead of one per card. */
export const getFavoriteListingIdSet = cache(async (userId: string) => {
  const rows = await db.favorite.findMany({ where: { userId }, select: { listingId: true } });
  return new Set(rows.map((r) => r.listingId));
});

export async function getUserFavoriteListings(userId: string) {
  const favorites = await db.favorite.findMany({
    where: { userId },
    include: { listing: { select: listingCardSelect } },
    orderBy: { createdAt: "desc" },
  });

  const listings = favorites.map((f) => f.listing);
  const [videoUrls, nightlyRanges] = await Promise.all([
    getFirstVideoUrlsByListingIds(listings.map((listing) => listing.id)),
    getNightlyRateRangesForListings(
      listings.flatMap((listing) =>
        listing.pricingRule
          ? [
              {
                id: listing.id,
                baseNightlyRate: Number(listing.pricingRule.baseNightlyRate),
              },
            ]
          : []
      )
    ),
  ]);
  return listings.map((listing) =>
    serializeListingCard(
      listing,
      videoUrls.get(listing.id),
      [],
      nightlyRanges.get(listing.id) ?? null
    )
  );
}

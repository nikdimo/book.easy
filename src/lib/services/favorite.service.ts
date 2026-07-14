import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { listingCardSelect, serializeListingCard } from "@/lib/serializers/listing-card";

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

  return favorites.map((f) => serializeListingCard(f.listing));
}

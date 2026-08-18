import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { ListingStatus } from "@prisma/client";

/**
 * Request-scoped memoization, not a cross-request cache: the listing detail route
 * calls this twice per request — once in `generateMetadata` and once in the page
 * itself — and this is the heaviest query on that page. `cache()` collapses those to
 * one fetch without any staleness risk, since the memo lives only for the request.
 */
export const getListingBySlug = cache(async (slug: string) => {
  return db.listing.findFirst({
    where: { slug, status: ListingStatus.APPROVED },
    include: {
      property: true,
      host: {
        include: { profile: true },
      },
      images: { orderBy: { displayOrder: "asc" } },
      pricingRule: true,
      promotions: {
        where: { disabledAt: null },
        orderBy: { createdAt: "desc" },
      },
      amenities: {
        include: { amenity: { include: { category: true } } },
        orderBy: [
          { amenity: { category: { sortOrder: "asc" } } },
          { amenity: { sortOrder: "asc" } },
        ],
      },
    },
  });
});

export async function getListingAvailabilityBlocks(listingId: string) {
  return db.availabilityBlock.findMany({
    where: {
      listingId,
      endDate: { gte: new Date() },
    },
    select: {
      startDate: true,
      endDate: true,
      blockType: true,
    },
  });
}

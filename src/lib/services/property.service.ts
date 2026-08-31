import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { ListingStatus } from "@prisma/client";
import { todayYmd, ymdToDbDate } from "@/lib/utils/date-only";

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

/**
 * Every approved listing, with just enough to build the sitemap: the slug for the
 * two public URLs it owns, `updatedAt` for `lastmod`, and its photos so the tour
 * page can be submitted as an image sitemap rather than left for a crawler to
 * find on its own. Ordered oldest-first so entries keep a stable position between
 * regenerations instead of reshuffling whenever a host edits something.
 */
export async function getListingsForSitemap() {
  return db.listing.findMany({
    where: { status: ListingStatus.APPROVED },
    select: {
      slug: true,
      updatedAt: true,
      images: {
        where: { mediaType: "IMAGE" },
        select: { url: true },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getListingAvailabilityBlocks(listingId: string) {
  return db.availabilityBlock.findMany({
    where: {
      listingId,
      // `endDate` is `@db.Date`, so this is a calendar comparison: against a raw
      // instant, a block ending today dropped out of the list part-way through it.
      endDate: { gte: ymdToDbDate(todayYmd()) },
    },
    select: {
      startDate: true,
      endDate: true,
      blockType: true,
    },
  });
}

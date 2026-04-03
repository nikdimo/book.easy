import { db } from "@/lib/db";
import { ListingStatus } from "@prisma/client";

export async function getListingBySlug(slug: string) {
  return db.listing.findFirst({
    where: { slug, status: ListingStatus.APPROVED },
    include: {
      property: true,
      host: {
        include: { profile: true },
      },
      images: { orderBy: { displayOrder: "asc" } },
      pricingRule: true,
      amenities: {
        include: { amenity: true },
        orderBy: { amenity: { category: "asc" } },
      },
    },
  });
}

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

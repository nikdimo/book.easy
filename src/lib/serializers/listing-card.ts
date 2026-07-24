import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Shape safe to pass from Server Components to Client Components (no Decimal/BigInt). */
export type ListingCardSerialized = {
  id: string;
  slug: string;
  title: string;
  description: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  property: {
    city: string;
    area?: string | null;
    propertyType: string;
    latitude?: number | null;
    longitude?: number | null;
  };
  images: { url: string; alt?: string | null }[];
  /** First video (by display order) among the listing's media, if any — cards use this
   * to play a preview on hover. */
  video: { url: string } | null;
  pricingRule: {
    baseNightlyRate: number;
    currency: string;
    minNights: number;
  } | null;
};

/** Looks up each listing's first VIDEO media item in one query, keyed by listing id —
 * a separate query because Prisma can't select the same `images` relation twice with
 * different filters in one `select`. */
export async function getFirstVideoUrlsByListingIds(
  listingIds: string[]
): Promise<Map<string, string>> {
  if (listingIds.length === 0) return new Map();
  const videos = await db.listingImage.findMany({
    where: { listingId: { in: listingIds }, mediaType: "VIDEO" },
    select: { listingId: true, url: true },
    orderBy: { displayOrder: "asc" },
  });
  const map = new Map<string, string>();
  for (const v of videos) {
    if (!map.has(v.listingId)) map.set(v.listingId, v.url);
  }
  return map;
}

/** Single source of truth for exactly the columns a listing card needs — reused by
 * every query that feeds serializeListingCard so the query and the type can't drift
 * apart. No amenities (the card doesn't render them) and callers should override
 * `images` with a small `take` (the card shows at most a handful of photos). */
export const listingCardSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  maxGuests: true,
  bedrooms: true,
  bathrooms: true,
  property: {
    select: {
      city: true,
      area: true,
      propertyType: true,
      latitude: true,
      longitude: true,
    },
  },
  images: { where: { mediaType: "IMAGE" }, select: { url: true, alt: true } },
  pricingRule: { select: { baseNightlyRate: true, currency: true, minNights: true } },
} satisfies Prisma.ListingSelect;

type ListingForCard = Prisma.ListingGetPayload<{ select: typeof listingCardSelect }>;

export function serializeListingCard(
  listing: ListingForCard,
  videoUrl?: string | null
): ListingCardSerialized {
  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    description: listing.description,
    maxGuests: listing.maxGuests,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    property: {
      city: listing.property.city,
      area: listing.property.area,
      propertyType: listing.property.propertyType,
      latitude: listing.property.latitude,
      longitude: listing.property.longitude,
    },
    images: listing.images.map((img) => ({
      url: img.url,
      alt: img.alt,
    })),
    video: videoUrl ? { url: videoUrl } : null,
    pricingRule: listing.pricingRule
      ? {
          baseNightlyRate: Number(listing.pricingRule.baseNightlyRate),
          currency: listing.pricingRule.currency,
          minNights: listing.pricingRule.minNights,
        }
      : null,
  };
}

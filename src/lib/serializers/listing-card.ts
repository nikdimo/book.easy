import type { Prisma } from "@prisma/client";

/** Shape safe to pass from Server Components to Client Components (no Decimal/BigInt). */
export type ListingCardSerialized = {
  id: string;
  slug: string;
  title: string;
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
  pricingRule: {
    baseNightlyRate: number;
    currency: string;
  } | null;
};

/** Single source of truth for exactly the columns a listing card needs — reused by
 * every query that feeds serializeListingCard so the query and the type can't drift
 * apart. No amenities (the card doesn't render them) and callers should override
 * `images` with a small `take` (the card shows at most a handful of photos). */
export const listingCardSelect = {
  id: true,
  slug: true,
  title: true,
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
  pricingRule: { select: { baseNightlyRate: true, currency: true } },
} satisfies Prisma.ListingSelect;

type ListingForCard = Prisma.ListingGetPayload<{ select: typeof listingCardSelect }>;

export function serializeListingCard(listing: ListingForCard): ListingCardSerialized {
  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
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
    pricingRule: listing.pricingRule
      ? {
          baseNightlyRate: Number(listing.pricingRule.baseNightlyRate),
          currency: listing.pricingRule.currency,
        }
      : null,
  };
}

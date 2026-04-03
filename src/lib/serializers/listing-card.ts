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
  };
  images: { url: string; alt?: string | null }[];
  pricingRule: {
    baseNightlyRate: number;
    currency: string;
  } | null;
};

type ListingForCard = Prisma.ListingGetPayload<{
  include: {
    property: true;
    images: true;
    pricingRule: true;
  };
}>;

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

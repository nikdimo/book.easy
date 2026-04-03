import type { Prisma } from "@prisma/client";

/** Plain data for `ListingForm` (client) — no Prisma Decimal/BigInt. */
export type HostListingFormData = {
  id: string;
  title: string;
  description: string;
  maxGuests: number;
  bedrooms: number;
  bathrooms: number;
  beds: number;
  property: {
    propertyType: string;
    address: string;
    city: string;
    area?: string | null;
    country: string;
  };
  pricingRule: {
    baseNightlyRate: number;
    cleaningFee: number;
    minNights: number;
  } | null;
  amenities: { amenityId: string }[];
};

type HostListingPayload = Prisma.ListingGetPayload<{
  include: {
    property: true;
    images: true;
    pricingRule: true;
    amenities: { include: { amenity: true } };
  };
}>;

export function serializeHostListingForForm(
  listing: HostListingPayload
): HostListingFormData {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    maxGuests: listing.maxGuests,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    beds: listing.beds,
    property: {
      propertyType: listing.property.propertyType,
      address: listing.property.address,
      city: listing.property.city,
      area: listing.property.area,
      country: listing.property.country,
    },
    pricingRule: listing.pricingRule
      ? {
          baseNightlyRate: Number(listing.pricingRule.baseNightlyRate),
          cleaningFee: Number(listing.pricingRule.cleaningFee),
          minNights: listing.pricingRule.minNights,
        }
      : null,
    amenities: listing.amenities.map((a) => ({ amenityId: a.amenityId })),
  };
}

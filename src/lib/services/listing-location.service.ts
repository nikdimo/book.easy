import "server-only";
import { db } from "@/lib/db";
import {
  listingLocationComplete,
  type StoredListingLocation,
} from "@/lib/host/v2/listing-location";

export interface ListingLocationEditorData {
  listing: {
    id: string;
    slug: string;
    status: string;
  };
  /** Exactly what the property row holds. Never a formatted or translated version of
   *  it — this is the text the host typed and the pin they placed. */
  stored: StoredListingLocation;
  complete: boolean;
}

/**
 * Everything the Location section renders from.
 *
 * Scoped to `hostId` inside the query rather than checked afterwards, so a listing the
 * caller does not own comes back as "not found" instead of leaking that it exists —
 * the same shape the rest of the editor's reads use. That matters more here than
 * anywhere else in the editor: the columns this returns include a street address and
 * exact coordinates.
 *
 * `geocodingConfidence` is deliberately not read. Every write path in the app has
 * always sent it empty, so the column holds nothing for any listing and surfacing it
 * would put an always-blank number in front of the host.
 */
export async function getListingLocationEditorData(
  listingId: string,
  hostId: string,
): Promise<ListingLocationEditorData | null> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: {
      id: true,
      slug: true,
      status: true,
      property: {
        select: {
          address: true,
          city: true,
          area: true,
          postalCode: true,
          country: true,
          latitude: true,
          longitude: true,
          locationSource: true,
          geocodingProvider: true,
          geocodingPlaceId: true,
          streetViewHeading: true,
          streetViewPitch: true,
          streetViewPanoId: true,
        },
      },
    },
  });
  if (!listing) return null;

  const property = listing.property;
  // Several of these columns are nullable in the schema but are only ever meaningful
  // to the editor as text. Collapsing null to "" here keeps every consumer — the
  // rules, the form, the diff against what is stored — working on one representation.
  const stored: StoredListingLocation = {
    address: property.address,
    city: property.city,
    area: property.area ?? "",
    postalCode: property.postalCode ?? "",
    country: property.country,
    latitude: property.latitude,
    longitude: property.longitude,
    locationSource: property.locationSource ?? "",
    geocodingProvider: property.geocodingProvider ?? "",
    geocodingPlaceId: property.geocodingPlaceId ?? "",
    streetViewHeading: property.streetViewHeading,
    streetViewPitch: property.streetViewPitch,
    streetViewPanoId: property.streetViewPanoId,
  };

  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    stored,
    complete: listingLocationComplete(stored),
  };
}

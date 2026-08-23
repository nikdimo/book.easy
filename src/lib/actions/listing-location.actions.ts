"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireHost } from "@/lib/auth-helpers";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import {
  listingLocationComplete,
  planListingLocationSave,
  publicLocationChanged,
  type ListingLocationInput,
  type ListingLocationSaveResult,
  type StoredListingLocation,
} from "@/lib/host/v2/listing-location";

/**
 * Saves the listing's address, pin and Street View angle.
 *
 * One explicit save rather than a per-field autosave. Every other editor section stores
 * text the host can see is right; this one stores a coordinate that decides where a
 * guest with a suitcase ends up, and picking a search result rewrites five address
 * fields at once. A host gets to look at the whole result before it is committed.
 *
 * Coordinates are only replaced when `input.pin` is present — see
 * `resolveLocationCoordinates`. A save that only corrects a house number leaves the pin,
 * the provider and the place id exactly as they were.
 */
export async function updateListingLocation(
  listingId: string,
  input: ListingLocationInput,
): Promise<ListingLocationSaveResult> {
  const user = await requireHost();

  // Scoped to the signed-in host in the query itself. A server action is reachable by a
  // direct POST, so this is the only thing standing between a stranger and another
  // host's street address.
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: user.id },
    select: {
      id: true,
      slug: true,
      status: true,
      propertyId: true,
      property: {
        select: {
          ownerId: true,
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
          listings: {
            select: { id: true, slug: true, status: true },
          },
        },
      },
    },
  });
  if (!listing || listing.property.ownerId !== user.id) {
    return { error: "Listing not found." };
  }

  const stored: StoredListingLocation = {
    address: listing.property.address,
    city: listing.property.city,
    area: listing.property.area ?? "",
    postalCode: listing.property.postalCode ?? "",
    country: listing.property.country,
    latitude: listing.property.latitude,
    longitude: listing.property.longitude,
    locationSource: listing.property.locationSource ?? "",
    geocodingProvider: listing.property.geocodingProvider ?? "",
    geocodingPlaceId: listing.property.geocodingPlaceId ?? "",
    streetViewHeading: listing.property.streetViewHeading,
    streetViewPitch: listing.property.streetViewPitch,
    streetViewPanoId: listing.property.streetViewPanoId,
  };

  // The client validates too, so reaching this means it was bypassed or is stale.
  // Rejecting rather than storing a partial address: half an address geocodes to
  // somewhere plausible and wrong, which is worse than an address that is obviously
  // unfinished.
  const plan = planListingLocationSave(input, stored);
  if (plan.action === "invalid") return { issues: plan.issues };

  const next: StoredListingLocation = { ...plan.write };

  if (plan.action === "save") {
    const guestVisibleChange = publicLocationChanged(plan.write, stored);

    await db.property.update({
      where: { id: listing.propertyId },
      data: {
        address: plan.write.address,
        city: plan.write.city,
        // `area` and `postalCode` are nullable columns and optional fields. An empty
        // box means "this address has none", which is a null rather than an empty
        // string, so search facets never group listings under a blank area.
        area: plan.write.area || null,
        postalCode: plan.write.postalCode || null,
        country: plan.write.country,
        latitude: plan.write.latitude,
        longitude: plan.write.longitude,
        locationSource: plan.write.locationSource || null,
        geocodingProvider: plan.write.geocodingProvider || null,
        geocodingPlaceId: plan.write.geocodingPlaceId || null,
        streetViewHeading: plan.write.streetViewHeading,
        streetViewPitch: plan.write.streetViewPitch,
        streetViewPanoId: plan.write.streetViewPanoId,
      },
    });

    // Only a change a guest can actually see puts a live listing back in front of an
    // admin. A corrected house number is private data and no one's business but the
    // host's; a move to another city is a different listing as far as search is
    // concerned. Same rule the Title & description save applies.
    const liveListingIds = listing.property.listings
      .filter((item) => item.status === "APPROVED")
      .map((item) => item.id);
    if (guestVisibleChange && liveListingIds.length > 0) {
      await db.listing.updateMany({
        where: { id: { in: liveListingIds } },
        data: { needsReview: true },
      });
    }

    refresh(listing.property.listings, guestVisibleChange);
  }

  return { stored: next, complete: listingLocationComplete(next) };
}

function refresh(
  listings: readonly { id: string; slug: string; status: string }[],
  guestVisibleChange: boolean,
) {
  for (const listing of listings) {
    revalidatePath(`/host/listings/${listing.id}/location`);
    revalidatePath(`/host/listings/${listing.id}`);
    revalidatePath(`/host/listings/${listing.id}/edit`);
    if (listing.status === "APPROVED" && guestVisibleChange) {
      revalidatePath(`/properties/${listing.slug}`);
    }
  }
  // The overview and the classic list both print the city, so both are stale the
  // moment this saves — on any status.
  revalidatePath("/host/listings");
  revalidatePath("/host/listings");
  // A Property may back several listings. Rebuild every live public page affected by
  // the shared write, and refresh the shared search/home caches once.
  if (
    guestVisibleChange &&
    listings.some((listing) => listing.status === "APPROVED")
  ) {
    revalidatePublicListingCaches();
  }
}

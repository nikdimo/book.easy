"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireHost } from "@/lib/auth-helpers";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import { listingPropertyDetailsComplete, listingPropertyDetailsIssues, type ListingPropertyDetailsInput, type ListingPropertyDetailsSaveResult } from "@/lib/host/v2/listing-property-details";

function refresh(listingId: string, slug: string, status: string) {
  revalidatePath(`/host/listings/${listingId}/rooms`);
  revalidatePath(`/host/listings/${listingId}`);
  revalidatePath("/host/listings");
  revalidatePath(`/host/listings/${listingId}/edit`);
  revalidatePath("/host/listings");
  if (status === "APPROVED") { revalidatePath(`/properties/${slug}`); revalidatePublicListingCaches(); }
}

export async function updateListingPropertyDetails(listingId: string, input: ListingPropertyDetailsInput): Promise<ListingPropertyDetailsSaveResult> {
  const user = await requireHost();
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: user.id },
    select: { id: true, slug: true, status: true, spaceType: true, bedrooms: true, beds: true, bathrooms: true, propertyId: true, property: { select: { propertyType: true } } },
  });
  if (!listing) return { error: "Listing not found." };
  const issues = listingPropertyDetailsIssues(input);
  if (Object.keys(issues).length > 0) return { issues };
  const propertyType = input.propertyType.trim();
  const typeExists = await db.propertyType.findUnique({ where: { value: propertyType }, select: { value: true } });
  if (!typeExists) return { issues: { propertyType: "INVALID" } };
  // Bedrooms and bathrooms are not written here. They are a copy of how many rooms of
  // each type the listing has, rewritten by `syncListingCountsFromRooms` whenever a room
  // is added or removed. Letting this debounced save persist them too would mean a host
  // who adds a bedroom and then changes the property type has the stale number from
  // before the add put back on top of the fresh one.
  const changed = propertyType !== listing.property.propertyType || input.spaceType !== listing.spaceType || input.beds !== listing.beds;
  if (changed) {
    await db.$transaction([
      db.property.update({ where: { id: listing.propertyId }, data: { propertyType } }),
      db.listing.update({ where: { id: listing.id }, data: { spaceType: input.spaceType, beds: input.beds, ...(listing.status === "APPROVED" ? { needsReview: true } : {}) } }),
    ]);
    refresh(listing.id, listing.slug, listing.status);
  }
  const stored = { ...input, propertyType, bedrooms: listing.bedrooms, bathrooms: listing.bathrooms };
  return { stored, complete: listingPropertyDetailsComplete(stored) };
}

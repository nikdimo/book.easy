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
  const changed = propertyType !== listing.property.propertyType || input.spaceType !== listing.spaceType || input.bedrooms !== listing.bedrooms || input.beds !== listing.beds || input.bathrooms !== listing.bathrooms;
  if (changed) {
    await db.$transaction([
      db.property.update({ where: { id: listing.propertyId }, data: { propertyType } }),
      db.listing.update({ where: { id: listing.id }, data: { spaceType: input.spaceType, bedrooms: input.bedrooms, beds: input.beds, bathrooms: input.bathrooms, ...(listing.status === "APPROVED" ? { needsReview: true } : {}) } }),
    ]);
    refresh(listing.id, listing.slug, listing.status);
  }
  const stored = { ...input, propertyType };
  return { stored, complete: listingPropertyDetailsComplete(stored) };
}

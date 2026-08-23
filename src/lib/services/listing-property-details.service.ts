import "server-only";
import { db } from "@/lib/db";
import { getActivePropertyTypes, getPropertyTypeOption } from "@/lib/services/property-type.service";
import { getListingEditorData } from "@/lib/services/listing-editor.service";
import { listingPropertyDetailsComplete } from "@/lib/host/v2/listing-property-details";

export async function getListingPropertyDetailsEditorData(listingId: string, hostId: string) {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: { id: true, slug: true, status: true, spaceType: true, bedrooms: true, beds: true, bathrooms: true, property: { select: { propertyType: true } } },
  });
  if (!listing) return null;
  const [activeTypes, currentType, editor] = await Promise.all([
    getActivePropertyTypes(), getPropertyTypeOption(listing.property.propertyType), getListingEditorData(listingId, hostId),
  ]);
  if (!editor) return null;
  const propertyTypes = activeTypes.some((type) => type.value === currentType.value) ? activeTypes : [currentType, ...activeTypes];
  const stored = { propertyType: listing.property.propertyType, spaceType: listing.spaceType, bedrooms: listing.bedrooms, beds: listing.beds, bathrooms: listing.bathrooms };
  return { listing: { id: listing.id, slug: listing.slug, status: listing.status }, stored, complete: listingPropertyDetailsComplete(stored), propertyTypes, rooms: editor.rooms, roomTypes: editor.roomTypes };
}

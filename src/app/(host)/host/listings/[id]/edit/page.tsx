import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getHostListing } from "@/lib/services/listing.service";
import { serializeHostListingForForm } from "@/lib/serializers/host-listing-form";
import { ListingForm } from "@/components/host/listing-form";
import { LISTING_STATUSES } from "@/lib/constants";
import { getActivePropertyTypes, getPropertyTypeLabel } from "@/lib/services/property-type.service";
import type { ListingMediaItem } from "@/lib/types/listing-media";

interface EditListingPageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Edit Listing" };

export default async function EditListingPage({ params }: EditListingPageProps) {
  const session = await auth();
  if (!session?.user?.isHost) redirect("/account/become-host");

  const { id } = await params;
  const listing = await getHostListing(id, session.user.id);
  if (!listing) notFound();

  const listingForm = serializeHostListingForForm(listing);
  const initialMediaItems: ListingMediaItem[] = listing.images.map((img) => ({
    id: img.id,
    url: img.url,
    mediaType: img.mediaType,
    alt: img.alt,
  }));

  const activeAmenities = await db.amenity.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  // A "this listing only" suggestion approval creates an inactive amenity/type that's
  // not offered to other hosts — but this listing is still using it, so the picker must
  // include it here or saving the form would silently drop it.
  const usedInactiveAmenities = listing.amenities
    .map((a) => a.amenity)
    .filter((a) => !a.isActive && !activeAmenities.some((active) => active.id === a.id));
  const amenities = [...activeAmenities, ...usedInactiveAmenities];

  const activePropertyTypes = await getActivePropertyTypes();
  const currentPropertyType = listing.property.propertyType;
  const propertyTypes = activePropertyTypes.some((t) => t.value === currentPropertyType)
    ? activePropertyTypes
    : [
        ...activePropertyTypes,
        { value: currentPropertyType, label: await getPropertyTypeLabel(currentPropertyType) },
      ];

  const cityRows = await db.property.findMany({
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });
  const availableCities = cityRows.map((row) => row.city);

  const statusConfig = LISTING_STATUSES.find((s) => s.value === listing.status);

  return (
    <div className="host-split-view xl:h-full xl:overflow-hidden">
      <ListingForm
        amenities={amenities}
        propertyTypes={propertyTypes}
        availableCities={availableCities}
        listing={listingForm}
        initialMediaItems={initialMediaItems}
        editStatusLabel={statusConfig?.label || listing.status}
        editStatusApproved={listing.status === "APPROVED"}
        availabilityHref={`/host/listings/${listing.id}/availability`}
        moderationNote={listing.moderationNote}
      />
    </div>
  );
}

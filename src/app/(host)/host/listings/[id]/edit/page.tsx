import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAmenityCatalogIncluding } from "@/lib/services/amenity.service";
import { getHostListing } from "@/lib/services/listing.service";
import { serializeHostListingForForm } from "@/lib/serializers/host-listing-form";
import { ListingForm } from "@/components/host/listing-form";
import { LISTING_STATUSES } from "@/lib/constants";
import { getActivePropertyTypes, getPropertyTypeOption } from "@/lib/services/property-type.service";
import type { ListingMediaItem } from "@/lib/types/listing-media";
import { getExchangeRates, quotableCurrencies } from "@/lib/currency/rates";

interface EditListingPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata = { title: "Edit Listing" };

export default async function EditListingPage({
  params,
  searchParams,
}: EditListingPageProps) {
  const session = await auth();
  if (!session?.user?.isHost) redirect("/account/become-host");

  const [{ id }, query] = await Promise.all([params, searchParams]);
  const listing = await getHostListing(id, session.user.id);
  if (!listing) notFound();

  const listingForm = serializeHostListingForForm(listing);
  const initialMediaItems: ListingMediaItem[] = listing.images.map((img) => ({
    id: img.id,
    url: img.url,
    mediaType: img.mediaType,
    alt: img.alt,
  }));

  const [amenities, rates] = await Promise.all([
    getAmenityCatalogIncluding(listing.amenities.map((a) => a.amenityId)),
    getExchangeRates(),
  ]);

  const activePropertyTypes = await getActivePropertyTypes();
  const currentPropertyType = listing.property.propertyType;
  const propertyTypes = activePropertyTypes.some((t) => t.value === currentPropertyType)
    ? activePropertyTypes
    : [
        ...activePropertyTypes,
        await getPropertyTypeOption(currentPropertyType),
      ];

  const statusConfig = LISTING_STATUSES.find((s) => s.value === listing.status);

  return (
    <div className="host-split-view h-full min-h-0 overflow-hidden">
      <ListingForm
        currencies={quotableCurrencies(rates)}
        amenities={amenities}
        propertyTypes={propertyTypes}
        listing={listingForm}
        initialMediaItems={initialMediaItems}
        editStatusLabel={statusConfig?.label || listing.status}
        editStatusApproved={listing.status === "APPROVED"}
        moderationNote={listing.moderationNote}
        initialPane={query.pane === "preview" ? "preview" : "edit"}
      />
    </div>
  );
}

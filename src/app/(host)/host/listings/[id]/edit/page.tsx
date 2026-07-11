import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getHostListing } from "@/lib/services/listing.service";
import { serializeHostListingForForm } from "@/lib/serializers/host-listing-form";
import { ListingForm } from "@/components/host/listing-form";
import { SubmitForReviewButton } from "@/components/host/submit-for-review-button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";
import { LISTING_STATUSES } from "@/lib/constants";
import { getActivePropertyTypes, getPropertyTypeLabel } from "@/lib/services/property-type.service";

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
  const initialImageUrls = listing.images.map((img) => img.url);

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
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Edit Listing</h1>
        <Badge variant={listing.status === "APPROVED" ? "default" : "secondary"}>
          {statusConfig?.label || listing.status}
        </Badge>
        <Button variant="outline" size="sm" className="ml-auto" asChild>
          <Link href={`/host/listings/${listing.id}/availability`}>
            <CalendarDays className="h-4 w-4 mr-2" />
            Availability &amp; pricing
          </Link>
        </Button>
      </div>

      {listing.moderationNote && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg mb-6">
          <p className="font-medium text-sm">Moderation feedback:</p>
          <p className="text-sm mt-1">{listing.moderationNote}</p>
        </div>
      )}

      <ListingForm
        amenities={amenities}
        propertyTypes={propertyTypes}
        availableCities={availableCities}
        listing={listingForm}
        initialImageUrls={initialImageUrls}
      />

      {(listing.status === "DRAFT" ||
        listing.status === "REJECTED" ||
        listing.status === "UNPUBLISHED") && (
        <div className="mt-6 pt-6 border-t">
          <SubmitForReviewButton listingId={listing.id} />
        </div>
      )}
    </div>
  );
}

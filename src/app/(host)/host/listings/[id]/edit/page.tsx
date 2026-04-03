import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getHostListing } from "@/lib/services/listing.service";
import { serializeHostListingForForm } from "@/lib/serializers/host-listing-form";
import { ListingForm } from "@/components/host/listing-form";
import { SubmitForReviewButton } from "@/components/host/submit-for-review-button";
import { Badge } from "@/components/ui/badge";
import { LISTING_STATUSES } from "@/lib/constants";

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

  const amenities = await db.amenity.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const statusConfig = LISTING_STATUSES.find((s) => s.value === listing.status);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Edit Listing</h1>
        <Badge variant={listing.status === "APPROVED" ? "default" : "secondary"}>
          {statusConfig?.label || listing.status}
        </Badge>
      </div>

      {listing.moderationNote && (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg mb-6">
          <p className="font-medium text-sm">Moderation feedback:</p>
          <p className="text-sm mt-1">{listing.moderationNote}</p>
        </div>
      )}

      <ListingForm
        amenities={amenities}
        listing={listingForm}
        initialImageUrls={initialImageUrls}
      />

      {(listing.status === "DRAFT" || listing.status === "REJECTED") && (
        <div className="mt-6 pt-6 border-t">
          <SubmitForReviewButton listingId={listing.id} />
        </div>
      )}
    </div>
  );
}

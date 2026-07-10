import { notFound } from "next/navigation";
import { getListingForAdminReview } from "@/lib/services/admin.service";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AdminListingActions } from "@/components/admin/admin-listing-actions";
import { PropertyAvailabilityCalendar } from "@/components/shared/property-availability-calendar";
import { LISTING_STATUSES, PROPERTY_TYPES } from "@/lib/constants";
import { formatDate, formatPrice } from "@/lib/utils/format";

interface AdminListingDetailProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Admin - Review Listing" };

export default async function AdminListingDetailPage({ params }: AdminListingDetailProps) {
  const { id } = await params;
  const result = await getListingForAdminReview(id);

  if (!result) notFound();
  const { listing, availabilityBlocks, datePrices } = result;

  const statusConfig = LISTING_STATUSES.find((s) => s.value === listing.status);
  const typeLabel = PROPERTY_TYPES.find((t) => t.value === listing.property.propertyType)?.label;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Review Listing</h1>
        <Badge variant={listing.status === "APPROVED" ? "default" : "secondary"}>
          {statusConfig?.label || listing.status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Listing Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Title</p>
                <p className="font-medium">{listing.title}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-sm whitespace-pre-line">{listing.description}</p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">Type: </span>{typeLabel}</div>
                <div><span className="text-muted-foreground">Location: </span>{listing.property.city}, {listing.property.area || ""}</div>
                <div><span className="text-muted-foreground">Address: </span>{listing.property.address}</div>
                <div><span className="text-muted-foreground">Max guests: </span>{listing.maxGuests}</div>
                <div><span className="text-muted-foreground">Bedrooms: </span>{listing.bedrooms}</div>
                <div><span className="text-muted-foreground">Bathrooms: </span>{listing.bathrooms}</div>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-2">Amenities</p>
                <div className="flex flex-wrap gap-1">
                  {listing.amenities.map(({ amenity }) => (
                    <Badge key={amenity.id} variant="secondary">{amenity.name}</Badge>
                  ))}
                </div>
              </div>
              {listing.pricingRule && (
                <>
                  <Separator />
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Nightly: </span>{formatPrice(Number(listing.pricingRule.baseNightlyRate))}</div>
                    <div><span className="text-muted-foreground">Cleaning: </span>{formatPrice(Number(listing.pricingRule.cleaningFee))}</div>
                    <div><span className="text-muted-foreground">Min nights: </span>{listing.pricingRule.minNights}</div>
                  </div>
                </>
              )}
              <Separator />
              <div className="text-sm">
                <span className="text-muted-foreground">Photos: </span>{listing.images.length} uploaded
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Host</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <div><span className="text-muted-foreground">Name: </span>{listing.host.name}</div>
              <div><span className="text-muted-foreground">Email: </span>{listing.host.email}</div>
              {listing.host.profile?.phone && (
                <div><span className="text-muted-foreground">Phone: </span>{listing.host.profile.phone}</div>
              )}
              <div><span className="text-muted-foreground">Created: </span>{formatDate(listing.createdAt)}</div>
              <div><span className="text-muted-foreground">Total bookings: </span>{listing._count.bookings}</div>
            </CardContent>
          </Card>

          <AdminListingActions listingId={listing.id} currentStatus={listing.status} />
        </div>
      </div>

      {listing.pricingRule && (
        <div className="mt-10 max-w-4xl">
          <h2 className="text-xl font-semibold mb-4">Availability &amp; date pricing</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Same calendar as the host dashboard. Changes apply immediately to the public listing.
          </p>
          <PropertyAvailabilityCalendar
            listingId={listing.id}
            baseNightlyRate={Number(listing.pricingRule.baseNightlyRate)}
            currency={listing.pricingRule.currency}
            datePrices={datePrices}
            existingBlocks={availabilityBlocks}
          />
        </div>
      )}
    </div>
  );
}

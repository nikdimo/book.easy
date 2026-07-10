import { notFound } from "next/navigation";
import { MapPin, Users, BedDouble, Bath, Bed } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ImageGallery } from "@/components/public/image-gallery";
import { AmenityList } from "@/components/public/amenity-list";
import { BookingWidget } from "@/components/public/booking-widget";
import { ListingActions } from "@/components/public/listing-actions";
import { getListingBySlug } from "@/lib/services/property.service";
import { getBlockedDateRangesForListing } from "@/lib/services/availability.service";
import { getFutureDatePriceRowsForListing } from "@/lib/services/pricing.service";
import { dateKey } from "@/lib/utils/stay-pricing";
import { PROPERTY_TYPES } from "@/lib/constants";
import type { Metadata } from "next";

interface ListingPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) return { title: "Not Found" };

  return {
    title: listing.title,
    description: listing.description.slice(0, 160),
    openGraph: {
      title: listing.title,
      description: listing.description.slice(0, 160),
      images: listing.images[0]?.url ? [listing.images[0].url] : [],
    },
  };
}

export default async function ListingDetailPage({ params }: ListingPageProps) {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);

  if (!listing) notFound();

  const disabledDateRanges = await getBlockedDateRangesForListing(listing.id);
  const priceOverrides = listing.pricingRule
    ? (
        await getFutureDatePriceRowsForListing(listing.id)
      ).map((r) => ({
        date: dateKey(new Date(r.date)),
        rate: Number(r.nightlyRate),
      }))
    : [];

  const hostInitials = listing.host.profile?.hostDisplayName?.[0] ||
    listing.host.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const hostName = listing.host.profile?.hostDisplayName || listing.host.name.split(" ")[0];
  const typeLabel = PROPERTY_TYPES.find((t) => t.value === listing.property.propertyType)?.label;
  const locationLine = [
    listing.property.area,
    listing.property.city,
    listing.property.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="max-w-[1120px] mx-auto px-4 md:px-6 py-6 md:py-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between gap-y-4 mb-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-[26px] font-semibold tracking-tight text-foreground leading-tight">
            {listing.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              {locationLine}
            </span>
            {typeLabel && (
              <>
                <span className="text-muted-foreground hidden sm:inline">·</span>
                <Badge variant="secondary" className="font-normal rounded-md">
                  {typeLabel}
                </Badge>
              </>
            )}
          </div>
        </div>
        <ListingActions title={listing.title} />
      </div>

      <ImageGallery images={listing.images} />

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14">
        <div className="lg:col-span-2 space-y-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground pb-2 border-b border-border/80">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {listing.maxGuests} guests
            </span>
            <span className="flex items-center gap-1.5">
              <BedDouble className="h-4 w-4" />
              {listing.bedrooms} bedrooms
            </span>
            <span className="flex items-center gap-1.5">
              <Bed className="h-4 w-4" />
              {listing.beds} beds
            </span>
            <span className="flex items-center gap-1.5">
              <Bath className="h-4 w-4" />
              {listing.bathrooms} baths
            </span>
          </div>

          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border-2 border-border">
              <AvatarFallback className="text-lg font-medium">{hostInitials}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">Hosted by {hostName}</p>
              {listing.host.profile?.hostBio && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {listing.host.profile.hostBio}
                </p>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h2 className="text-xl font-semibold mb-4">About this space</h2>
            <div className="text-muted-foreground whitespace-pre-line leading-relaxed">
              {listing.description}
            </div>
          </div>

          <Separator />

          <AmenityList amenities={listing.amenities} />
        </div>

        <div className="relative">
          {listing.pricingRule && (
            <BookingWidget
              listingId={listing.id}
              maxGuests={listing.maxGuests}
              nightlyRate={Number(listing.pricingRule.baseNightlyRate)}
              cleaningFee={Number(listing.pricingRule.cleaningFee)}
              currency={listing.pricingRule.currency}
              minNights={listing.pricingRule.minNights}
              disabledDateRanges={disabledDateRanges}
              priceOverrides={priceOverrides}
            />
          )}
        </div>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Sparkles, Users, BedDouble, Bath, Bed, Star } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ImageGallery } from "@/components/public/image-gallery";
import {
  ExpandableDescription,
  PreservedPlaceText,
} from "@/components/public/expandable-description";
import { AmenityList } from "@/components/public/amenity-list";
import { BookingWidget } from "@/components/public/booking-widget";
import { ListingActions } from "@/components/public/listing-actions";
import { ListingViewTracker } from "@/components/public/listing-view-tracker";
import { PropertyStreetView } from "@/components/public/property-street-view";
import { getListingBySlug } from "@/lib/services/property.service";
import { getBlockedDateRangesForListing } from "@/lib/services/availability.service";
import { getFutureDatePriceRowsForListing } from "@/lib/services/pricing.service";
import { dateKey } from "@/lib/utils/stay-pricing";
import { getPropertyTypeLabel } from "@/lib/services/property-type.service";
import { auth } from "@/lib/auth";
import { getFavoriteListingIdSet } from "@/lib/services/favorite.service";
import { getT, T, ti, tPlural } from "@/lib/i18n/t";
import { formatPrice } from "@/lib/utils/format";
import type { Metadata } from "next";
import { getPublishedListingReviews } from "@/lib/services/review.service";

interface ListingPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) return { title: "Not Found" };
  const ogImage = listing.images.find((item) => item.mediaType === "IMAGE")?.url;

  return {
    title: listing.title,
    description: listing.description.slice(0, 160),
    openGraph: {
      title: listing.title,
      description: listing.description.slice(0, 160),
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function ListingDetailPage({ params, searchParams }: ListingPageProps) {
  const { slug } = await params;
  const search = await searchParams;
  const listing = await getListingBySlug(slug);

  if (!listing) notFound();

  const initialCheckIn = typeof search.checkIn === "string" ? search.checkIn : undefined;
  const initialCheckOut = typeof search.checkOut === "string" ? search.checkOut : undefined;
  const hasExplicitSearchSelection = [
    "checkIn",
    "checkOut",
    "guests",
    "adults",
    "children",
    "infants",
    "pets",
  ].some((key) => typeof search[key] === "string");
  const toGuestCount = (value: string | string[] | undefined) => {
    const count = typeof value === "string" ? Number(value) : 0;
    return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  };
  const initialGuestDetails = {
    adults: toGuestCount(search.adults),
    children: toGuestCount(search.children),
    infants: toGuestCount(search.infants),
    pets: toGuestCount(search.pets),
  };
  const initialGuests = search.guests
    ? Number(search.guests)
    : initialGuestDetails.adults + initialGuestDetails.children || undefined;

  const disabledDateRanges = await getBlockedDateRangesForListing(listing.id);
  const priceOverrides = listing.pricingRule
    ? (
        await getFutureDatePriceRowsForListing(listing.id)
      ).map((r) => ({
        date: dateKey(new Date(r.date)),
        rate: Number(r.nightlyRate),
      }))
    : [];
  const reviewSummary = await getPublishedListingReviews(listing.id);
  const promotion = listing.promotions[0] ?? null;

  const hostInitials = listing.host.profile?.hostDisplayName?.[0] ||
    listing.host.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const hostName = listing.host.profile?.hostDisplayName || listing.host.name.split(" ")[0];
  const typeLabel = await getPropertyTypeLabel(listing.property.propertyType);
  const t = await getT();
  const reserveTooltip = t.resolve(
    "booking_widget.reserve_tooltip",
    "Send a booking request to the host — you won't be charged yet."
  );
  const guestCount = tPlural(t, "listing.guests", listing.maxGuests, "{n} guest", "{n} guests");
  const bedroomCount = tPlural(t, "listing.bedrooms", listing.bedrooms, "{n} bedroom", "{n} bedrooms");
  const bedCount = tPlural(t, "listing.beds", listing.beds, "{n} bed", "{n} beds");
  const bathCount = tPlural(t, "listing.baths", listing.bathrooms, "{n} bath", "{n} baths");
  const minimumNights = tPlural(
    t,
    "listing.minimum_nights",
    listing.pricingRule?.minNights ?? 1,
    "{n} night minimum",
    "{n} nights minimum"
  );
  const cleaningFeeLabel = ti(t, "listing.cleaning_fee", "Cleaning fee", {});
  const hostedBy = ti(t, "listing.hosted_by", "Hosted by {name}", { name: hostName });
  const session = await auth();
  const isSaved = session?.user
    ? (await getFavoriteListingIdSet(session.user.id)).has(listing.id)
    : false;
  const locationLine = [
    listing.property.area,
    listing.property.city,
    listing.property.country,
  ]
    .filter(Boolean)
    .join(", ");
  const protectedPlaceNames = [
    listing.property.city,
    listing.property.area,
    listing.property.country,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="max-w-[1120px] mx-auto px-4 md:px-6 pt-6 md:pt-8 pb-28 lg:pb-8">
      <ListingViewTracker listingId={listing.id} />
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between gap-y-4 mb-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-[26px] font-semibold tracking-tight text-foreground leading-tight">
            <PreservedPlaceText text={listing.title} placeNames={protectedPlaceNames} />
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm">
            <span
              className="notranslate flex items-center gap-1 text-muted-foreground"
              translate="no"
            >
              <MapPin className="h-4 w-4 shrink-0" />
              {locationLine}
            </span>
            {listing.property.latitude != null &&
              listing.property.longitude != null &&
              listing.property.streetViewPanoId &&
              listing.property.streetViewHeading != null &&
              listing.property.streetViewPitch != null && (
                <PropertyStreetView
                  latitude={listing.property.latitude}
                  longitude={listing.property.longitude}
                  panoId={listing.property.streetViewPanoId}
                  heading={listing.property.streetViewHeading}
                  pitch={listing.property.streetViewPitch}
                />
              )}
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
        <ListingActions
          title={listing.title}
          listingId={listing.id}
          initialSaved={isSaved}
          isAuthenticated={!!session?.user}
        />
      </div>

      <ImageGallery images={listing.images} />

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14">
        <div className="lg:col-span-2 space-y-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground pb-2 border-b border-border/80">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              <span className={guestCount.translated ? "notranslate" : undefined}>{guestCount.text}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <BedDouble className="h-4 w-4" />
              <span className={bedroomCount.translated ? "notranslate" : undefined}>{bedroomCount.text}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Bed className="h-4 w-4" />
              <span className={bedCount.translated ? "notranslate" : undefined}>{bedCount.text}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Bath className="h-4 w-4" />
              <span className={bathCount.translated ? "notranslate" : undefined}>{bathCount.text}</span>
            </span>
            {listing.pricingRule && (
              <>
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4" />
                  <span className={minimumNights.translated ? "notranslate" : undefined}>{minimumNights.text}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4" />
                  <span>
                    <span className={cleaningFeeLabel.translated ? "notranslate" : undefined}>{cleaningFeeLabel.text}</span>{" "}
                    {formatPrice(Number(listing.pricingRule.cleaningFee), listing.pricingRule.currency, t.locale)}
                  </span>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14 border-2 border-border">
              <AvatarFallback className="text-lg font-medium">{hostInitials}</AvatarFallback>
            </Avatar>
            <div>
              <p className={hostedBy.translated ? "notranslate font-semibold" : "font-semibold"}>{hostedBy.text}</p>
              {listing.host.profile?.hostBio && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {listing.host.profile.hostBio}
                </p>
              )}
            </div>
          </div>

          <Separator />

          <div>
            <h2 className="text-xl font-semibold mb-4"><T t={t} k="listing.about" source="About this space" /></h2>
            <ExpandableDescription
              text={listing.description}
              preservePlaceNames={protectedPlaceNames}
            />
          </div>

          <Separator />

          <AmenityList amenities={listing.amenities} />

          {reviewSummary.count > 0 ? (
            <>
              <Separator />
              <section aria-labelledby="guest-reviews-heading">
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <h2 id="guest-reviews-heading" className="text-xl font-semibold">
                    <T t={t} k="listing.guest_reviews" source="Guest reviews" />
                  </h2>
                  {reviewSummary.count >= 3 && reviewSummary.average != null ? (
                    <span className="flex items-center gap-1 font-semibold">
                      <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                      {reviewSummary.average.toFixed(2)}
                    </span>
                  ) : null}
                  <span className="text-sm text-muted-foreground">
                    {reviewSummary.count} {reviewSummary.count === 1 ? "review" : "reviews"}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {reviewSummary.reviews.map((review) => {
                    const overall = review.ratings.find(
                      (rating) => rating.category === "OVERALL"
                    )?.score;
                    return (
                      <article key={review.id} className="rounded-xl border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{review.author?.name || "BookEasy guest"}</p>
                          {overall ? (
                            <span className="flex items-center gap-1 text-sm font-semibold">
                              <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                              {overall}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                          {review.publicComment}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </section>
            </>
          ) : null}
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
              promotion={
                promotion
                  ? {
                      id: promotion.id,
                      type: promotion.type,
                      discountPercent: promotion.discountPercent,
                      minimumNights: promotion.minimumNights,
                    }
                  : null
              }
              disabledDateRanges={disabledDateRanges}
              priceOverrides={priceOverrides}
              initialCheckIn={initialCheckIn}
              initialCheckOut={initialCheckOut}
              initialGuests={initialGuests}
              initialGuestDetails={initialGuestDetails}
              hasExplicitSearchSelection={hasExplicitSearchSelection}
              reserveTooltip={reserveTooltip}
            />
          )}
        </div>
      </div>
    </div>
  );
}

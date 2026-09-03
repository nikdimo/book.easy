import { notFound } from "next/navigation";
import {
  CalendarDays,
  Clock,
  Home,
  MapPin,
  Sparkles,
  Users,
  BedDouble,
  Bath,
  Bed,
  Star,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ImageGallery } from "@/components/public/image-gallery";
import {
  ExpandableDescription,
  PreservedPlaceText,
} from "@/components/public/expandable-description";
import { AmenityList } from "@/components/public/amenity-list";
import { HouseRulesList } from "@/components/public/house-rules-list";
import {
  AcceptedPaymentMethods,
  toAcceptedPaymentMethodsPresentation,
} from "@/components/booking/accepted-payment-methods";
import { DepositPoliciesSummary } from "@/components/booking/deposit-policies-summary";
import { createDepositPoliciesSnapshot } from "@/lib/payments/deposit-policies";
import { cancellationPolicySnapshot } from "@/lib/payments/cancellation-policy";
import { houseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";
import { houseRulesVersion } from "@/lib/host/v2/house-rules-version.server";
import { ListingLocationMap } from "@/components/public/listing-location-map";
import { BookingWidget } from "@/components/public/booking-widget";
import { ListingStayProvider } from "@/components/public/listing-stay-context";
import { ListingAvailabilityCalendar } from "@/components/public/listing-availability-calendar";
import { ListingActions } from "@/components/public/listing-actions";
import { ListingViewTracker } from "@/components/public/listing-view-tracker";
import { StartConversationButton } from "@/components/communication/start-conversation-button";
import { getListingBySlug } from "@/lib/services/property.service";
import { bookableStayFromSearch } from "@/lib/utils/booking-selection";
import { dbDateToYmd, todayYmd } from "@/lib/utils/date-only";
import { getBlockedDateRangesForListing } from "@/lib/services/availability.service";
import { getFutureDatePriceRowsForListing } from "@/lib/services/pricing.service";
import { toStayPromotion } from "@/lib/utils/stay-pricing";
import { getPropertyTypeLabel } from "@/lib/services/property-type.service";
import { auth } from "@/lib/auth";
import { getFavoriteListingIdSet } from "@/lib/services/favorite.service";
import { getT, T, ti, tPlural } from "@/lib/i18n/t";
import { LocalizedPrice } from "@/components/shared/localized-price";
import {
  resolveListingSpaceTypeLabel,
  resolvePropertyTypeLabel,
} from "@/lib/i18n/property-type-labels";
import type { Metadata } from "next";
import { getPublishedListingReviews } from "@/lib/services/review.service";
import { PRODUCT_NAME } from "@/lib/branding";

interface ListingPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
}: ListingPageProps): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListingBySlug(slug);
  if (!listing) return { title: "Not Found" };
  // The photo Facebook, WhatsApp and every other unfurler shows for a shared link.
  // `images` arrives ordered by `displayOrder` alone, so the first row is not
  // necessarily the one the host flagged as the cover — a promoted link would then
  // preview a bathroom because it happened to sort first. Prefer the primary photo and
  // keep the display order as the fallback.
  const photos = listing.images.filter((item) => item.mediaType === "IMAGE");
  const ogImage = (photos.find((item) => item.isPrimary) ?? photos[0])?.url;
  const description = listing.description.trim().slice(0, 160);
  const publicPath = `/properties/${encodeURIComponent(listing.slug)}`;

  return {
    title: listing.title,
    description,
    alternates: { canonical: publicPath },
    openGraph: {
      title: listing.title,
      description,
      type: "website",
      siteName: PRODUCT_NAME,
      url: publicPath,
      images: ogImage
        ? [{ url: ogImage, alt: listing.title }]
        : [],
    },
  };
}

export default async function ListingDetailPage({
  params,
  searchParams,
}: ListingPageProps) {
  const { slug } = await params;
  const search = await searchParams;
  const listing = await getListingBySlug(slug);

  if (!listing) notFound();

  // A stay is only seeded from the URL when it is still bookable. Listing links get
  // shared and bookmarked with the dates the sender was looking at, and a stay that has
  // since gone by used to arrive here priced and bookable — the guest pressed request to book,
  // agreed to the house rules and only then met the server's "check-in cannot be in the
  // past". Dropping it seeds nothing instead, which is what the page shows a guest who
  // arrived without dates at all.
  /**
   * Whether this listing sells whole stays rather than arbitrary date ranges.
   *
   * Everything below that differs between the two modes reads this one flag: the URL
   * seed, the availability calendar, the minimum-nights fact and what the booking widget
   * is handed. A FLEXIBLE listing — which is every listing unless a host deliberately
   * switched — takes every branch it took before.
   */
  const sellsFixedStays = listing.bookingMode === "FIXED_STAYS";

  const seededStay = bookableStayFromSearch(
    search.checkIn,
    search.checkOut,
    todayYmd(),
  );
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

  // None of these depend on each other, so they run concurrently rather than as four
  // sequential round-trips (they were previously awaited one at a time, and each one's
  // latency added directly to this page's TTFB).
  const [
    disabledDateRanges,
    priceRows,
    reviewSummary,
    rawTypeLabel,
    t,
  ] = await Promise.all([
    getBlockedDateRangesForListing(listing.id),
    listing.pricingRule
      ? getFutureDatePriceRowsForListing(listing.id)
      : Promise.resolve([]),
    getPublishedListingReviews(listing.id),
    getPropertyTypeLabel(listing.property.propertyType),
    getT(),
  ]);
  // Both modes seed from the URL. A weekly listing books by ordinary dates, so a shared
  // link carrying a changeover-day range is a real selection on it — and one carrying a
  // Tuesday fails the same rule the calendar and the server apply, and is refused rather
  // than silently honoured. Guest counts seed as they always did.
  const initialCheckIn = seededStay.checkIn;
  const initialCheckOut = seededStay.checkOut;

  // `date` is `@db.Date`; its UTC fields are the day the host priced. Read locally
  // this keyed a June 10 override as "2026-06-09" on any server behind UTC (M6).
  const priceOverrides = priceRows.map((r) => ({
    date: dbDateToYmd(r.date),
    rate: Number(r.nightlyRate),
  }));

  const hostInitials =
    listing.host.profile?.hostDisplayName?.[0] ||
    listing.host.name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2);
  const hostName =
    listing.host.profile?.hostDisplayName || listing.host.name.split(" ")[0];
  const requestToBookTooltip = t.resolve(
    "booking_widget.request_to_book_tooltip",
    "Send a booking request. The host will review it and share payment instructions if it is accepted.",
  );
  const guestCount = tPlural(
    t,
    "listing.guests",
    listing.maxGuests,
    "{n} guest",
    "{n} guests",
  );
  const bedroomCount = tPlural(
    t,
    "listing.bedrooms",
    listing.bedrooms,
    "{n} bedroom",
    "{n} bedrooms",
  );
  const bedCount = tPlural(
    t,
    "listing.beds",
    listing.beds,
    "{n} bed",
    "{n} beds",
  );
  const bathCount = tPlural(
    t,
    "listing.baths",
    listing.bathrooms,
    "{n} bath",
    "{n} baths",
  );
  // The compact facts row names weekly mode. Its minimum and maximum still apply and are
  // enforced by the picker and booking transaction just as they are in flexible mode.
  const minimumNights = sellsFixedStays
    ? ti(t, "listing.weekly_stays_only", "Weekly stays only", {})
    : tPlural(
        t,
        "listing.minimum_nights",
        listing.pricingRule?.minNights ?? 1,
        "{n} night minimum",
        "{n} nights minimum",
      );
  const cleaningFeeLabel = ti(t, "listing.cleaning_fee", "Cleaning fee", {});
  // Only shown when the host actually stated a time. A listing that says nothing here
  // is the host being flexible, and inventing "15:00" for it would be a promise the
  // guest could hold them to.
  const stayTimes =
    listing.checkInTime || listing.checkOutTime
      ? listing.checkInTime && listing.checkOutTime
        ? ti(t, "listing.stay_times", "Check-in {in} · Check-out {out}", {
            in: listing.checkInTime,
            out: listing.checkOutTime,
          })
        : listing.checkInTime
          ? ti(t, "listing.check_in_from", "Check-in from {time}", {
              time: listing.checkInTime,
            })
          : ti(t, "listing.check_out_by", "Check-out by {time}", {
              time: listing.checkOutTime as string,
            })
      : null;
  // The listing's rules in the shape a booking freezes, so the section below, the
  // booking sheet and — later — the guest's confirmation all render from one thing.
  const houseRules = houseRulesSnapshot(listing);
  const renderedHouseRulesVersion = houseRulesVersion(houseRules);
  const hostedBy = ti(t, "listing.hosted_by", "Hosted by {name}", {
    name: hostName,
  });
  const session = await auth();
  // A host opening their own listing has nobody to message — the inquiry service
  // rejects it — so the button is simply not there for them.
  const isOwnListing = session?.user?.id === listing.hostId;
  // Reuses the guest booking page's key rather than minting a new one, so the
  // words arrive already translated in every locale.
  const messageHostLabel = t.resolve(
    "account.booking.message_host",
    "Message host"
  ).text;
  const messageHostButton = isOwnListing ? null : (
    <StartConversationButton
      listingId={listing.id}
      isAuthenticated={!!session?.user}
      label={messageHostLabel}
      variant="outline"
      iconOnly
    />
  );
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
  const typeLabel = resolvePropertyTypeLabel(
    t,
    listing.property.propertyType,
    rawTypeLabel,
  ).text;
  const spaceTypeLabel = resolveListingSpaceTypeLabel(t, listing.spaceType).text;
  // These are the exact validated public terms rendered both on this page and in
  // the request review. No account destination, handle, URL, or instruction crosses
  // the server/client boundary.
  const acceptedPaymentMethods = toAcceptedPaymentMethodsPresentation({
    reviewedAt: listing.paymentMethodsReviewedAt?.toISOString() ?? null,
    methodCodes: listing.acceptedPaymentMethods,
    otherLabel: listing.paymentMethodOther,
  });
  const depositPolicies = createDepositPoliciesSnapshot(listing);
  const cancellationPolicy = cancellationPolicySnapshot(
    listing.freeCancellationDaysBeforeCheckIn,
    listing.cancellationPolicyReviewedAt,
  );
  // A host is not a guest at their own place. `createBooking` refuses a self-booking
  // outright — that refusal is the enforcement, and it holds for a request posted
  // straight at the action — so leaving the widget here would only offer a host a
  // button that ends in an error. Everything else on the page stays: the photos, the
  // rules and the availability calendar are exactly what this host wants to check.
  const bookingWidget = isOwnListing ? (
    <div className="rounded-2xl border border-border/50 bg-muted/20 p-5 text-sm text-muted-foreground lg:sticky lg:top-24">
      <T
        t={t}
        k="listing.own_listing_notice"
        source="You host this listing, so you can't send a booking request for it."
      />
    </div>
  ) : listing.pricingRule ? (
    <BookingWidget
      listingId={listing.id}
      maxGuests={listing.maxGuests}
      nightlyRate={Number(listing.pricingRule.baseNightlyRate)}
      cleaningFee={Number(listing.pricingRule.cleaningFee)}
      currency={listing.pricingRule.currency}
      minNights={listing.pricingRule.minNights}
      maxNights={listing.pricingRule.maxNights}
      promotions={listing.promotions.map(toStayPromotion)}
      disabledDateRanges={disabledDateRanges}
      priceOverrides={priceOverrides}
      initialCheckIn={initialCheckIn}
      initialCheckOut={initialCheckOut}
      initialGuests={initialGuests}
      initialGuestDetails={initialGuestDetails}
      hasExplicitSearchSelection={hasExplicitSearchSelection}
      // "Ask the host" is a conversation, not a refusal, so only an outright no takes
      // the counter away. An unanswered policy cannot reach a published listing.
      petsAllowed={houseRules.petPolicy !== "NOT_ALLOWED"}
      requestToBookTooltip={requestToBookTooltip}
      acceptedPaymentMethods={acceptedPaymentMethods}
      depositPolicies={depositPolicies}
      cancellationPolicy={cancellationPolicy}
      messageHost={messageHostButton}
      houseRules={<HouseRulesList t={t} rules={houseRules} />}
      houseRulesVersion={renderedHouseRulesVersion}
      bookingMode={sellsFixedStays ? "FIXED_STAYS" : "FLEXIBLE"}
      changeoverWeekday={listing.changeoverWeekday}
    />
  ) : null;
  // Airbnb-style: the open nights are on the page itself, so a guest who arrived
  // without dates can pick them here rather than through the widget's picker.
  // Weekly mode uses the constrained picker in the booking card. The large calendar
  // does not yet understand changeover days, so showing it here would invite invalid
  // ranges even though the booking card and server correctly refuse them.
  const availabilityCalendar = listing.pricingRule && !sellsFixedStays ? (
    <ListingAvailabilityCalendar
      placeName={listing.property.city}
      minNights={listing.pricingRule.minNights}
      disabledDateRanges={disabledDateRanges}
      baseNightlyRate={Number(listing.pricingRule.baseNightlyRate)}
      currency={listing.pricingRule.currency}
      priceOverrides={priceOverrides}
      promotions={listing.promotions.map(toStayPromotion)}
    />
  ) : null;

  return (
    <div className="max-w-[1120px] mx-auto px-4 md:px-6 pt-6 md:pt-8 pb-28 lg:pb-8">
      <ListingViewTracker listingId={listing.id} />
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between gap-y-4 mb-6">
        <div className="min-w-0 flex-1">
          <h1
            data-user-generated-content
            data-translatable-user-content
            translate="yes"
            className="text-xl md:text-[26px] font-semibold tracking-tight text-foreground leading-tight"
          >
            <PreservedPlaceText
              text={listing.title}
              placeNames={protectedPlaceNames}
            />
          </h1>
          {/* Subtitle, not chrome: where the place is and what you get of it, in one
             quiet line. These were two filled badges — one brand, one teal — which
             read as two calls to action stacked under the title and pulled the eye
             off it. The property type moved down to the facts row under the gallery,
             where the rest of "what this place is" already lives. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span
              className="notranslate flex items-center gap-1"
              translate="no"
            >
              <MapPin className="h-4 w-4 shrink-0" />
              {locationLine}
            </span>
            {/* Street View is deliberately not shown here. It reveals the exact
               building, so it is held back until the host has confirmed a booking and
               arrival is close — see canSeeExactLocation and the guest's booking
               detail page. Public visitors get the area, not the front door. */}
            {spaceTypeLabel && (
              <>
                <span aria-hidden>·</span>
                <span>{spaceTypeLabel}</span>
              </>
            )}
          </div>
        </div>
        <ListingActions
          title={listing.title}
          listingId={listing.id}
          initialSaved={isSaved}
          isAuthenticated={!!session?.user}
          isOwnListing={isOwnListing}
        />
      </div>

      <ImageGallery images={listing.images} slug={slug} />

      <ListingStayProvider
        initialCheckIn={initialCheckIn}
        initialCheckOut={initialCheckOut}
      >
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-14">
          <div className="lg:col-span-2 space-y-8">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground pb-2 border-b border-border/80">
              {typeLabel && (
                <span className="flex items-center gap-1.5">
                  <Home className="h-4 w-4" />
                  <span>{typeLabel}</span>
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                <span
                  className={guestCount.translated ? "notranslate" : undefined}
                >
                  {guestCount.text}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <BedDouble className="h-4 w-4" />
                <span
                  className={
                    bedroomCount.translated ? "notranslate" : undefined
                  }
                >
                  {bedroomCount.text}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <Bed className="h-4 w-4" />
                <span
                  className={bedCount.translated ? "notranslate" : undefined}
                >
                  {bedCount.text}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <Bath className="h-4 w-4" />
                <span
                  className={bathCount.translated ? "notranslate" : undefined}
                >
                  {bathCount.text}
                </span>
              </span>
              {stayTimes && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  <span
                    className={stayTimes.translated ? "notranslate" : undefined}
                  >
                    {stayTimes.text}
                  </span>
                </span>
              )}
              {listing.pricingRule && (
                <>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    <span
                      className={
                        minimumNights.translated ? "notranslate" : undefined
                      }
                    >
                      {minimumNights.text}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4" />
                    <span>
                      <span
                        className={
                          cleaningFeeLabel.translated
                            ? "notranslate"
                            : undefined
                        }
                      >
                        {cleaningFeeLabel.text}
                      </span>{" "}
                      <LocalizedPrice
                        amount={Number(listing.pricingRule.cleaningFee)}
                        currency={listing.pricingRule.currency}
                        locale={t.locale}
                      />
                    </span>
                  </span>
                </>
              )}
            </div>

            {/* Messaging the host belongs with the host, not up in the share/save row
               where it used to sit: it is the one action here that starts a
               conversation, and the icon says that in the width a phone has. */}
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border-2 border-border">
                <AvatarFallback className="text-lg font-medium">
                  {hostInitials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p
                  className={
                    hostedBy.translated
                      ? "notranslate font-semibold"
                      : "font-semibold"
                  }
                >
                  {hostedBy.text}
                </p>
                {listing.host.profile?.hostBio && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                    {listing.host.profile.hostBio}
                  </p>
                )}
              </div>
              {messageHostButton}
            </div>

            <Separator />

            <div>
              <h2 className="text-xl font-semibold mb-4">
                <T t={t} k="listing.about" source="About this space" />
              </h2>
              <ExpandableDescription
                text={listing.description}
                preservePlaceNames={protectedPlaceNames}
              />
            </div>

            <Separator />

            <AmenityList amenities={listing.amenities} />

            <Separator />

            <AcceptedPaymentMethods
              t={t}
              data={acceptedPaymentMethods}
            />

            <DepositPoliciesSummary t={t} data={depositPolicies} />

            <Separator />

            <section aria-labelledby="house-rules-heading">
              <h2 id="house-rules-heading" className="text-xl font-semibold mb-4">
                <T t={t} k="listing.house_rules.heading" source="House rules" />
              </h2>
              {/* The same rules the guest must accept before the request is sent, in the
                  same words: the booking sheet renders this list too. A rule the host
                  never answered is absent from both rather than shown as a blank. */}
              <HouseRulesList t={t} rules={houseRules} />
            </section>
          </div>

          {/* One mount at every width. The widget is a sticky card in this column on
              desktop and a sticky bar plus its drawers on phones, so below `lg` it
              contributes no layout of its own and this cell collapses away. */}
          <div className="relative max-lg:contents lg:col-start-3 lg:row-start-1 lg:block">
            {bookingWidget}
          </div>

          {availabilityCalendar && (
            <div className="border-y border-border/70 py-8 lg:col-span-3 lg:py-10">
              {availabilityCalendar}
            </div>
          )}

          {listing.property.latitude != null &&
            listing.property.longitude != null && (
              <div className="space-y-8 lg:col-span-3">
                <Separator />
                <ListingLocationMap
                  listingId={listing.id}
                  latitude={listing.property.latitude}
                  longitude={listing.property.longitude}
                  locationLine={locationLine}
                />
              </div>
            )}

          <div className="space-y-8 lg:col-span-2">
            {reviewSummary.count > 0 ? (
              <>
                <Separator />
                <section aria-labelledby="guest-reviews-heading">
                  <div className="mb-5 flex flex-wrap items-center gap-3">
                    <h2
                      id="guest-reviews-heading"
                      className="text-xl font-semibold"
                    >
                      <T
                        t={t}
                        k="listing.guest_reviews"
                        source="Guest reviews"
                      />
                    </h2>
                    {reviewSummary.count >= 3 &&
                    reviewSummary.average != null ? (
                      <span className="flex items-center gap-1 font-semibold">
                        <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                        {reviewSummary.average.toFixed(2)}
                      </span>
                    ) : null}
                    <span className="text-sm text-muted-foreground">
                      {reviewSummary.count}{" "}
                      {reviewSummary.count === 1 ? "review" : "reviews"}
                    </span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {reviewSummary.reviews.map((review) => {
                      const overall = review.ratings.find(
                        (rating) => rating.category === "OVERALL",
                      )?.score;
                      return (
                        <article
                          key={review.id}
                          className="rounded-xl border p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">
                              {review.author?.name || "BookEasy guest"}
                            </p>
                            {overall ? (
                              <span className="flex items-center gap-1 text-sm font-semibold">
                                <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                                {overall}
                              </span>
                            ) : null}
                          </div>
                          <p
                            data-user-generated-content
                            data-translatable-user-content
                            translate="yes"
                            className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground"
                          >
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

        </div>
      </ListingStayProvider>
    </div>
  );
}

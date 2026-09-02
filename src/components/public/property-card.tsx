import { Badge } from "@/components/ui/badge";
import { formatCalendarDateShort } from "@/lib/utils/format";
import { getPropertyTypeLabel } from "@/lib/services/property-type.service";
import { resolveListingSpaceTypeLabel, resolvePropertyTypeLabel } from "@/lib/i18n/property-type-labels";
import { isValid, parseISO } from "date-fns";
import { PropertyCardGallery } from "@/components/public/property-card-gallery";
import { LocalizedPrice } from "@/components/shared/localized-price";
import { auth } from "@/lib/auth";
import { getFavoriteListingIdSet } from "@/lib/services/favorite.service";
import { getT, T, TWithValues, ti, tPlural } from "@/lib/i18n/t";
import { localizePlaceName } from "@/lib/i18n/place-name";
import { Moon, UserRound } from "lucide-react";
import {
  computeStayQuote,
  parseLocalYmd,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";
import { listingSearchLinkQuery } from "@/lib/fixed-stay-options";

interface PropertyCardProps {
  listing: {
    id: string;
    slug: string;
    title: string;
    maxGuests: number;
    bedrooms: number;
    bathrooms: number;
    spaceType?: "ENTIRE_PLACE" | "PRIVATE_ROOM" | "SHARED_ROOM" | "HOTEL_ROOM";
    /** How the listing sells its dates. Absent means the flexible calendar. */
    bookingMode?: "FLEXIBLE" | "FIXED_STAYS";
    /** The stay a dated search matched exactly, carried into this card's link. */
    matchedFixedStayPeriodId?: string | null;
    property: {
      city: string;
      area?: string | null;
      propertyType: string;
    };
    images: { url: string; alt?: string | null }[];
    video?: { url: string } | null;
    pricingRule?: {
      baseNightlyRate: number;
      cleaningFee: number;
      currency: string;
      minNights: number;
    } | null;
    promotions?: StayPromotion[];
    priceOverrides?: { date: string; rate: number }[];
    /** Bookable nightly rates over the next year — shown as a span when the guest has
     * not picked dates yet. */
    nightlyRange?: { min: number; max: number } | null;
  };
  /** When set with checkOut, card shows trip dates and total price (Airbnb-style). */
  checkIn?: string;
  checkOut?: string;
  nightCount?: number;
  /** Query string (no leading "?") carrying the current search's dates/guests to the listing page. */
  searchQuery?: string;
  /** Connects this card to its price marker when rendered in the marketplace explorer. */
  mapListingId?: string;
}

/** Server component — only the photo gallery and save button need client interactivity
 * (see PropertyCardGallery); everything else here ships zero client JS. */
export async function PropertyCard({
  listing,
  checkIn,
  checkOut,
  nightCount,
  searchQuery,
  mapListingId,
}: PropertyCardProps) {
  const t = await getT();
  const { slug, title, property, images, video, pricingRule, promotions } =
    listing;
  const displayImages = images.filter((img) => img.url?.trim());
  const city = localizePlaceName(property.city, t.locale);
  const typeLabel = resolvePropertyTypeLabel(
    t,
    property.propertyType,
    await getPropertyTypeLabel(property.propertyType),
  ).text;
  const displayTypeLabel =
    listing.spaceType && listing.spaceType !== "ENTIRE_PLACE"
      ? resolveListingSpaceTypeLabel(t, listing.spaceType).text
      : typeLabel;
  const sellsFixedStays = listing.bookingMode === "FIXED_STAYS";
  // A flexible card's link is untouched. A fixed-stay card's carries the stay it matched
  // and drops the dates, which its listing page is required to ignore anyway.
  const linkQuery = listingSearchLinkQuery(searchQuery, listing);
  const href = `/properties/${slug}${linkQuery ? `?${linkQuery}` : ""}`;

  const session = await auth();
  const isSaved = session?.user
    ? (await getFavoriteListingIdSet(session.user.id)).has(listing.id)
    : false;

  const showTrip =
    checkIn &&
    checkOut &&
    nightCount != null &&
    nightCount >= 1 &&
    isValid(parseISO(checkIn)) &&
    isValid(parseISO(checkOut));
  const dateLine =
    showTrip &&
    `${formatCalendarDateShort(checkIn!, t.locale)} – ${formatCalendarDateShort(checkOut!, t.locale)}`;

  const nightly = pricingRule ? Number(pricingRule.baseNightlyRate) : 0;
  // A listing that charges one rate all year has nothing to span, so it keeps the
  // single price rather than printing the same number twice.
  const rateRange =
    listing.nightlyRange && listing.nightlyRange.max > listing.nightlyRange.min
      ? listing.nightlyRange
      : null;
  // The low end of what is actually bookable, falling back to the base rate only when
  // there is no range at all. Reading `nightly` whenever min equalled max printed the
  // base rate for a listing whose every night is overridden to something else — and
  // the search now filters and sorts on this same number, so the card would have been
  // ordered by one price and labelled with another.
  const leadingNightly = listing.nightlyRange?.min ?? nightly;
  const quote =
    showTrip && pricingRule
      ? computeStayQuote({
          baseNightly: nightly,
          cleaningFee: pricingRule.cleaningFee,
          checkIn: parseLocalYmd(checkIn!),
          checkOut: parseLocalYmd(checkOut!),
          overrides: new Map(
            (listing.priceOverrides ?? []).map((row) => [row.date, row.rate]),
          ),
          promotions,
        })
      : null;
  const tripTotal = quote?.total ?? null;
  const promotion =
    quote?.appliedPromotion ??
    [...(promotions ?? [])].sort((left, right) => {
      const leftSpecific = left.startDate && left.endDate ? 1 : 0;
      const rightSpecific = right.startDate && right.endDate ? 1 : 0;
      if (leftSpecific !== rightSpecific) return leftSpecific - rightSpecific;
      return (left.minimumNights ?? 1) - (right.minimumNights ?? 1);
    })[0] ??
    null;
  // A minimum stay is a rule about ranges a guest may pick. A fixed-stay listing has
  // none: the host chose each stay's length, and `createBooking` skips the minimum for
  // exactly that reason — so a card that measured a matched stay against it would grey
  // out the very result the search just proved bookable.
  const belowMinStay =
    !sellsFixedStays &&
    showTrip &&
    pricingRule != null &&
    nightCount! < pricingRule.minNights;
  const minimumStay = sellsFixedStays
    ? ti(t, "listing.fixed_stays_only", "Fixed stays only", {})
    : pricingRule
      ? tPlural(
          t,
          "property_card.minimum_nights",
          pricingRule.minNights,
          "{n}-night min.",
          "{n}-night min.",
        )
      : null;
  const guestsLabel = tPlural(
    t,
    "listing.guests",
    listing.maxGuests,
    "{n} guest",
    "{n} guests",
  );
  // The amounts stay in the listing's official currency all the way into the markup;
  // `LocalizedPrice` is what converts them, on the client, from the display currency
  // in context. Formatting them here instead froze the currency the card was first
  // rendered in — a card served from the router cache then disagreed with the rest of
  // the page after the visitor changed currency. The maths is unchanged: conversion
  // still happens after `computeStayQuote` has applied promotions and fees in the
  // official currency, never before and never as a second pricing calculation.
  const showTotalPrice = pricingRule != null && tripTotal != null;
  // The stay's own average, not the base rate: the total beside it already reflects
  // custom nightly rates and any promotion, so quoting the base rate here would print
  // two numbers that don't multiply out.
  const showNightlyPrice = showTotalPrice && quote != null;
  const showOriginalTotal =
    pricingRule != null &&
    quote?.promotionEligible === true &&
    quote.discountAmount > 0;
  const promotionMinimum = promotion?.minimumNights;
  const promotionLabel = promotion
    ? promotion.type === "PERCENT_DISCOUNT"
      ? promotionMinimum
        ? ti(
            t,
            "promotion.percent_min_nights",
            "{percent}% off · {n}+ nights",
            {
              percent: promotion.discountPercent ?? 0,
              n: promotionMinimum,
            },
          )
        : ti(t, "promotion.percent_off", "{percent}% off", {
            percent: promotion.discountPercent ?? 0,
          })
      : promotionMinimum
        ? ti(
            t,
            "promotion.free_cleaning_min_nights",
            "Free cleaning · {n}+ nights",
            {
              n: promotionMinimum,
            },
          )
        : ti(t, "promotion.free_cleaning", "Free cleaning", {})
    : null;
  const showPromotionBadge =
    Boolean(promotionLabel?.text) &&
    (!showTrip ||
      !quote?.promotionEligible ||
      promotion?.type === "FREE_CLEANING");
  const freeCleaningApplied = ti(
    t,
    "promotion.free_cleaning_included",
    "Free cleaning included",
    {},
  );
  const coverPromotion = showPromotionBadge
    ? quote?.promotionEligible && promotion?.type === "FREE_CLEANING"
      ? freeCleaningApplied
      : promotionLabel
    : null;

  return (
    <div className="flex flex-col gap-3" data-map-listing-id={mapListingId}>
      <PropertyCardGallery
        href={href}
        title={title}
        images={displayImages}
        videoUrl={video?.url}
        listingId={listing.id}
        initialSaved={isSaved}
        isAuthenticated={!!session?.user}
        promotionLabel={coverPromotion}
      />

      <a href={href} className="group/link flex min-w-0 flex-col gap-0.5 px-1">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <h3 className="min-w-0 flex-1 truncate text-[0.95rem] font-semibold leading-snug text-foreground group-hover/link:underline underline-offset-2">
            <TWithValues
              t={t}
              k="property_card.type_in_city"
              source="{type} in {city}"
              values={{ type: displayTypeLabel, city }}
              protectedValues={["city"]}
            />
          </h3>
          {belowMinStay ? (
            <Badge
              variant="secondary"
              className="shrink-0 font-medium text-xs rounded-md"
            >
              <span
                className={minimumStay?.translated ? "notranslate" : undefined}
              >
                {minimumStay?.text}
              </span>
            </Badge>
          ) : null}
        </div>

        <p
          data-user-generated-content
          data-translatable-user-content
          translate="yes"
          className="truncate text-[0.9rem] leading-5 text-muted-foreground"
        >
          {title}
        </p>

        {dateLine ? (
          <p
            className="notranslate text-[0.9rem] leading-5 text-muted-foreground"
            translate="no"
          >
            {dateLine}
          </p>
        ) : null}

        {showTotalPrice && pricingRule && tripTotal != null ? (
          <div className="mt-1 flex flex-col items-start leading-5">
            <span className="text-[0.85rem] text-muted-foreground">
              {showNightlyPrice && quote ? (
                <TWithValues
                  t={t}
                  k="property_card.price_per_night"
                  source="{price} per night"
                  values={{
                    price: (
                      <LocalizedPrice
                        amount={quote.effectiveAverageNightly}
                        currency={pricingRule.currency}
                        locale={t.locale}
                      />
                    ),
                  }}
                />
              ) : null}
            </span>
            <div className="flex items-baseline gap-2">
            {promotion?.type === "PERCENT_DISCOUNT" && showOriginalTotal && quote ? (
              <LocalizedPrice
                amount={quote.originalTotal}
                currency={pricingRule.currency}
                locale={t.locale}
                className="text-[0.9rem] text-muted-foreground line-through"
              />
            ) : null}
            <span className="text-[0.95rem] font-semibold text-foreground underline decoration-1 underline-offset-2">
              <TWithValues
                t={t}
                k="property_card.price_total"
                source="{price} total"
                values={{
                  price: (
                    <LocalizedPrice
                      amount={tripTotal}
                      currency={pricingRule.currency}
                      locale={t.locale}
                    />
                  ),
                }}
              />
            </span>
            </div>
          </div>
        ) : pricingRule ? (
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[0.85rem] leading-5 text-muted-foreground">
            <span
              className="flex shrink-0 items-center gap-1"
              aria-label={guestsLabel.text}
            >
              <UserRound className="size-4" aria-hidden="true" />
              <span>{listing.maxGuests}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex min-w-0 items-center gap-1">
              <Moon className="size-4 shrink-0" aria-hidden="true" />
              <span
                className={`truncate ${minimumStay?.translated ? "notranslate" : ""}`}
              >
                {minimumStay?.text}
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="flex shrink-0 items-baseline gap-1">
              <LocalizedPrice
                amount={leadingNightly}
                currency={pricingRule.currency}
                locale={t.locale}
                className="text-[0.95rem] font-semibold text-foreground"
              />
              {rateRange ? (
                <>
                  <span
                    className="text-[0.95rem] font-semibold text-foreground"
                    aria-hidden="true"
                  >
                    –
                  </span>
                  <LocalizedPrice
                    amount={rateRange.max}
                    currency={pricingRule.currency}
                    locale={t.locale}
                    className="text-[0.95rem] font-semibold text-foreground"
                  />
                </>
              ) : null}
              <span className="text-[0.9rem] text-muted-foreground">
                <T t={t} k="property_card.per_night" source="night" />
              </span>
            </span>
          </div>
        ) : null}
      </a>
    </div>
  );
}

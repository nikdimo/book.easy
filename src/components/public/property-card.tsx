import { Badge } from "@/components/ui/badge";
import { formatDateShort } from "@/lib/utils/format";
import { getPriceFormatter } from "@/lib/currency/price";
import { getPropertyTypeLabel } from "@/lib/services/property-type.service";
import { parseISO, isValid } from "date-fns";
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

interface PropertyCardProps {
  listing: {
    id: string;
    slug: string;
    title: string;
    maxGuests: number;
    bedrooms: number;
    bathrooms: number;
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
  // Request-scoped: a grid of two hundred cards resolves the rate table once.
  const price = await getPriceFormatter();
  const { slug, title, property, images, video, pricingRule, promotions } =
    listing;
  const displayImages = images.filter((img) => img.url?.trim());
  const city = localizePlaceName(property.city, t.locale);
  const typeLabel = await getPropertyTypeLabel(property.propertyType);
  const href = `/properties/${slug}${searchQuery ? `?${searchQuery}` : ""}`;

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
    `${formatDateShort(parseISO(checkIn!), t.locale)} – ${formatDateShort(parseISO(checkOut!), t.locale)}`;

  const nightly = pricingRule ? Number(pricingRule.baseNightlyRate) : 0;
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
  const belowMinStay =
    showTrip && pricingRule != null && nightCount! < pricingRule.minNights;
  const minimumStay = pricingRule
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
  // Converted into the guest's display currency where a rate exists, and left in the
  // listing's official currency where it does not. Conversion happens here, after
  // `computeStayQuote` has already applied promotions and fees in the official
  // currency — never before, and never as a second pricing calculation.
  const totalPrice =
    pricingRule && tripTotal != null
      ? ti(t, "property_card.price_total", "{price} total", {
          price: price.format(tripTotal, pricingRule.currency).text,
        })
      : null;
  const nightlyPrice =
    pricingRule && tripTotal != null
      ? ti(t, "property_card.price_per_night", "{price} per night", {
          price: price.format(nightly, pricingRule.currency).text,
        })
      : null;
  const originalTotalPrice =
    pricingRule && quote?.promotionEligible && quote.discountAmount > 0
      ? price.format(quote.originalTotal, pricingRule.currency).text
      : null;
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
              values={{ type: typeLabel, city }}
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

        <p className="truncate text-[0.9rem] leading-5 text-muted-foreground">
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

        {pricingRule && tripTotal != null ? (
          <div className="mt-1 flex flex-col items-start leading-5">
            <span className="text-[0.85rem] text-muted-foreground">
              <span
                className={nightlyPrice?.translated ? "notranslate" : undefined}
              >
                {nightlyPrice?.text}
              </span>
            </span>
            <div className="flex items-baseline gap-2">
            {promotion?.type === "PERCENT_DISCOUNT" && originalTotalPrice ? (
              <span className="text-[0.9rem] text-muted-foreground line-through">
                {originalTotalPrice}
              </span>
            ) : null}
            <span className="text-[0.95rem] font-semibold text-foreground underline decoration-1 underline-offset-2">
              <span
                className={totalPrice?.translated ? "notranslate" : undefined}
              >
                {totalPrice?.text}
              </span>
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
                amount={nightly}
                currency={pricingRule.currency}
                locale={t.locale}
                className="text-[0.95rem] font-semibold text-foreground"
              />
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

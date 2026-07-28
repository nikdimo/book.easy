import Image from "next/image";
import { getPropertyTypeLabel } from "@/lib/services/property-type.service";
import type { ListingCardSerialized } from "@/lib/serializers/listing-card";
import { getT, T, TWithValues, ti, tPlural } from "@/lib/i18n/t";
import { LocalizedPrice } from "@/components/shared/localized-price";
import { PropertyCardSpotlightMedia } from "@/components/public/property-card-spotlight-media";
import { localizePlaceName } from "@/lib/i18n/place-name";
import { Moon, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PropertyCardSpotlightProps {
  listing: ListingCardSerialized;
}

/** Larger, editorial-style card used on the homepage while inventory is thin — a photo
 * collage plus a real description reads as "curated" rather than "empty grid with one
 * tile in it" (see PropertyCard, which is the compact single-photo variant used once
 * there's enough inventory to fill a dense grid). */
export async function PropertyCardSpotlight({ listing }: PropertyCardSpotlightProps) {
  const t = await getT();
  const {
    slug,
    title,
    description,
    property,
    images,
    video,
    pricingRule,
    promotion,
  } = listing;
  const displayImages = images.filter((img) => img.url?.trim());
  const [main, ...rest] = displayImages;
  const sideImages = rest.slice(0, 2);
  const typeLabel = await getPropertyTypeLabel(property.propertyType);
  const guests = tPlural(t, "listing.guests", listing.maxGuests, "{n} guest", "{n} guests");
  const minimumStay = pricingRule
    ? tPlural(
        t,
        "property_card.minimum_nights",
        pricingRule.minNights,
        "{n}-night min.",
        "{n}-night min."
      )
    : null;
  const href = `/properties/${slug}`;
  const promotionLabel = promotion
    ? promotion.type === "PERCENT_DISCOUNT"
      ? promotion.minimumNights
        ? ti(t, "promotion.percent_min_nights", "{percent}% off · {n}+ nights", {
            percent: promotion.discountPercent ?? 0,
            n: promotion.minimumNights,
          })
        : ti(t, "promotion.percent_off", "{percent}% off", {
            percent: promotion.discountPercent ?? 0,
          })
      : promotion.minimumNights
        ? ti(t, "promotion.free_cleaning_min_nights", "Free cleaning · {n}+ nights", {
            n: promotion.minimumNights,
          })
        : ti(t, "promotion.free_cleaning", "Free cleaning", {})
    : null;

  return (
    <a
      href={href}
      className="group grid grid-cols-1 sm:grid-cols-2 overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
    >
      <div className="relative grid grid-cols-3 grid-rows-2 gap-0.5 aspect-[4/3] sm:aspect-auto bg-muted">
        {main ? (
          <PropertyCardSpotlightMedia
            imageUrl={main.url}
            imageAlt={main.alt || title}
            videoUrl={video?.url}
            className={
              sideImages.length > 0
                ? "relative col-span-2 row-span-2"
                : "relative col-span-3 row-span-2"
            }
          />
        ) : (
          <div className="col-span-3 row-span-2 flex items-center justify-center text-muted-foreground text-sm">
            <T t={t} k="property_card.no_photos" source="No photos" />
          </div>
        )}
        {sideImages.map((img, i) => (
          <div key={img.url + i} className="relative col-span-1 row-span-1">
            <Image
              src={img.url}
              alt={img.alt || title}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 33vw, 13vw"
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col justify-center gap-2 p-5 sm:p-6">
        <h3 className="text-lg font-semibold text-foreground leading-snug group-hover:underline underline-offset-2">
          <TWithValues
            t={t}
            k="property_card.type_in_city"
            source="{type} in {city}"
            values={{ type: typeLabel, city: localizePlaceName(property.city, t.locale) }}
            protectedValues={["city"]}
          />
        </h3>
        <p className="text-muted-foreground text-sm line-clamp-3">{description}</p>
        {promotionLabel ? (
          <Badge variant="secondary" className="w-fit rounded-md">
            <span className={promotionLabel.translated ? "notranslate" : undefined}>
              {promotionLabel.text}
            </span>
          </Badge>
        ) : null}
        {pricingRule ? (
          <div className="mt-1 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span
              className="flex shrink-0 items-center gap-1"
              aria-label={guests.text}
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
                amount={pricingRule.baseNightlyRate}
                currency={pricingRule.currency}
                locale={t.locale}
                className="text-base font-semibold text-foreground"
              />
              <span className="text-sm text-muted-foreground">
                <T t={t} k="property_card.per_night" source="night" />
              </span>
            </span>
          </div>
        ) : null}
      </div>
    </a>
  );
}

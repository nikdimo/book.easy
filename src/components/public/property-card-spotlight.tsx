import Link from "next/link";
import Image from "next/image";
import { getPropertyTypeLabel } from "@/lib/services/property-type.service";
import type { ListingCardSerialized } from "@/lib/serializers/listing-card";
import { getT, T, ti, tPlural } from "@/lib/i18n/t";
import { LocalizedPrice } from "@/components/shared/localized-price";

interface PropertyCardSpotlightProps {
  listing: ListingCardSerialized;
}

/** Larger, editorial-style card used on the homepage while inventory is thin — a photo
 * collage plus a real description reads as "curated" rather than "empty grid with one
 * tile in it" (see PropertyCard, which is the compact single-photo variant used once
 * there's enough inventory to fill a dense grid). */
export async function PropertyCardSpotlight({ listing }: PropertyCardSpotlightProps) {
  const t = await getT();
  const { slug, title, description, property, images, pricingRule } = listing;
  const displayImages = images.filter((img) => img.url?.trim());
  const [main, ...rest] = displayImages;
  const sideImages = rest.slice(0, 2);
  const typeLabel = await getPropertyTypeLabel(property.propertyType);
  const headline = ti(t, "property_card.type_in_city", "{type} in {city}", {
    type: typeLabel,
    city: property.city,
  });
  const guests = tPlural(t, "listing.guests", listing.maxGuests, "{n} guest", "{n} guests");
  const bedrooms = tPlural(t, "listing.bedrooms", listing.bedrooms, "{n} bedroom", "{n} bedrooms");
  const baths = tPlural(t, "listing.baths", listing.bathrooms, "{n} bath", "{n} baths");
  const href = `/properties/${slug}`;

  return (
    <Link
      href={href}
      className="group grid grid-cols-1 sm:grid-cols-2 overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
    >
      <div className="relative grid grid-cols-3 grid-rows-2 gap-0.5 aspect-[4/3] sm:aspect-auto bg-muted">
        {main ? (
          <div
            className={
              sideImages.length > 0
                ? "relative col-span-2 row-span-2"
                : "relative col-span-3 row-span-2"
            }
          >
            <Image
              src={main.url}
              alt={main.alt || title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, 40vw"
            />
          </div>
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
          <span className={headline.translated ? "notranslate" : undefined}>{headline.text}</span>
        </h3>
        <p className="text-muted-foreground text-sm line-clamp-3">{description}</p>
        <p className="text-muted-foreground text-xs">
          <span className={guests.translated ? "notranslate" : undefined}>{guests.text}</span> ·{" "}
          <span className={bedrooms.translated ? "notranslate" : undefined}>{bedrooms.text}</span> ·{" "}
          <span className={baths.translated ? "notranslate" : undefined}>{baths.text}</span>
        </p>
        {pricingRule ? (
          <div className="mt-1 flex items-baseline gap-1">
            <LocalizedPrice
              amount={pricingRule.baseNightlyRate}
              currency={pricingRule.currency}
              locale={t.locale}
              className="text-base font-semibold text-foreground"
            />
            <span className="text-muted-foreground text-sm"><T t={t} k="property_card.per_night" source="night" /></span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}

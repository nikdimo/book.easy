import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils/format";
import { getPropertyTypeLabel } from "@/lib/services/property-type.service";
import { format, parseISO, isValid } from "date-fns";
import { PropertyCardGallery } from "@/components/public/property-card-gallery";

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
    pricingRule?: {
      baseNightlyRate: number;
      currency: string;
    } | null;
  };
  /** When set with checkOut, card shows trip dates and total price (Airbnb-style). */
  checkIn?: string;
  checkOut?: string;
  nightCount?: number;
  /** Query string (no leading "?") carrying the current search's dates/guests to the listing page. */
  searchQuery?: string;
}

/** Server component — only the photo gallery and save button need client interactivity
 * (see PropertyCardGallery); everything else here ships zero client JS. */
export async function PropertyCard({
  listing,
  checkIn,
  checkOut,
  nightCount,
  searchQuery,
}: PropertyCardProps) {
  const { slug, title, property, images, pricingRule } = listing;
  const displayImages = images.filter((img) => img.url?.trim());
  const city = property.city;
  const typeLabel = await getPropertyTypeLabel(property.propertyType);
  const headline = `${typeLabel} in ${city}`;
  const href = `/properties/${slug}${searchQuery ? `?${searchQuery}` : ""}`;

  const showTrip =
    checkIn &&
    checkOut &&
    nightCount != null &&
    nightCount >= 1 &&
    isValid(parseISO(checkIn)) &&
    isValid(parseISO(checkOut));
  const dateLine =
    showTrip &&
    `${format(parseISO(checkIn!), "MMM d")} – ${format(parseISO(checkOut!), "MMM d")}`;

  const nightly = pricingRule ? Number(pricingRule.baseNightlyRate) : 0;
  const tripTotal = showTrip && pricingRule ? nightly * nightCount! : null;

  return (
    <div className="flex flex-col gap-3">
      <PropertyCardGallery href={href} title={title} images={displayImages} />

      <Link
        href={href}
        className="flex flex-col gap-1 px-0.5 group/link"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 font-semibold text-foreground leading-snug line-clamp-2 group-hover/link:underline underline-offset-2">
            {headline}
          </h3>
          <Badge
            variant="secondary"
            className="shrink-0 font-medium text-xs rounded-md"
          >
            New
          </Badge>
        </div>

        <p className="text-muted-foreground text-sm line-clamp-1">{title}</p>

        {dateLine ? (
          <p className="text-muted-foreground text-sm">{dateLine}</p>
        ) : null}

        {pricingRule && tripTotal != null ? (
          <div className="mt-0.5">
            <span className="font-semibold text-foreground">
              {formatPrice(tripTotal, pricingRule.currency)} total
            </span>
          </div>
        ) : pricingRule ? (
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="font-semibold text-foreground">
              {formatPrice(nightly, pricingRule.currency)}
            </span>
            <span className="text-muted-foreground text-sm">night</span>
          </div>
        ) : null}
      </Link>
    </div>
  );
}

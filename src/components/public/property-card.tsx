"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Heart, Star, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { PROPERTY_TYPES } from "@/lib/constants";
import { format, parseISO, isValid } from "date-fns";

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
}

function demoRating(id: string): { score: string; reviews: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const score = (4.7 + (h % 30) / 100).toFixed(2);
  const reviews = 12 + (h % 220);
  return { score, reviews };
}

function propertyTypeLabel(value: string) {
  return PROPERTY_TYPES.find((t) => t.value === value)?.label ?? value;
}

function isBusinessHost(id: string): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) >>> 0;
  return h % 3 !== 0;
}

function guestFavorite(id: string): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 13 + id.charCodeAt(i)) >>> 0;
  return h % 4 === 0;
}

function superhost(id: string): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 19 + id.charCodeAt(i)) >>> 0;
  return h % 5 === 0;
}

export function PropertyCard({
  listing,
  checkIn,
  checkOut,
  nightCount,
}: PropertyCardProps) {
  const { slug, title, property, images, pricingRule } = listing;
  const displayImages = images.filter((img) => img.url?.trim());
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [saved, setSaved] = useState(false);
  const city = property.city;
  const typeLabel = propertyTypeLabel(property.propertyType);
  const headline = `${typeLabel} in ${city}`;
  const { score, reviews } = demoRating(listing.id);
  const safeIndex = Math.min(
    currentImageIndex,
    Math.max(0, displayImages.length - 1)
  );
  const cover = displayImages[safeIndex];
  const hasMultiple = displayImages.length > 1;

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
  const tripTotal =
    showTrip && pricingRule ? nightly * nightCount! : null;
  const business = isBusinessHost(listing.id);
  const tagGuestFavorite = guestFavorite(listing.id);
  const tagSuperhost = superhost(listing.id);

  return (
    <div
      className="group flex flex-col gap-3"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative aspect-[20/19] overflow-hidden rounded-xl bg-muted sm:aspect-[4/3]">
        <Link href={`/properties/${slug}`} className="absolute inset-0 z-0">
          {cover ? (
            <Image
              src={cover.url}
              alt={cover.alt || title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 35vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              No photos
            </div>
          )}
        </Link>

        <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap gap-2">
          {tagGuestFavorite && (
            <span className="pointer-events-none rounded-md bg-background/95 px-2 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm">
              Guest favorite
            </span>
          )}
          {tagSuperhost && (
            <span className="pointer-events-none rounded-md bg-background/95 px-2 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm">
              Superhost
            </span>
          )}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="icon"
          className={cn(
            "absolute right-3 top-3 z-10 h-9 w-9 rounded-full border-0 bg-transparent hover:bg-white/10 shadow-none",
            saved && "text-primary"
          )}
          aria-label={saved ? "Remove from saved" : "Save listing"}
          onClick={(e) => {
            e.preventDefault();
            setSaved((s) => !s);
          }}
        >
          <Heart
            className={cn(
              "h-6 w-6 transition-colors",
              saved
                ? "fill-primary text-primary"
                : "fill-black/20 text-white drop-shadow-sm"
            )}
            strokeWidth={1.5}
          />
        </Button>

        {isHovered && hasMultiple && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentImageIndex(
                  (p) =>
                    (p - 1 + displayImages.length) % displayImages.length
                );
              }}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-black shadow-sm hover:bg-white hover:scale-105 transition-all"
              aria-label="Previous photo"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrentImageIndex((p) => (p + 1) % displayImages.length);
              }}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-black shadow-sm hover:bg-white hover:scale-105 transition-all"
              aria-label="Next photo"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {hasMultiple && (
          <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-[5]">
            {displayImages.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === currentImageIndex ? "w-4 bg-white" : "w-1.5 bg-white/60"
                )}
              />
            ))}
          </div>
        )}
      </div>

      <Link
        href={`/properties/${slug}`}
        className="flex flex-col gap-1 px-0.5 group/link"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 font-semibold text-foreground leading-snug line-clamp-2 group-hover/link:underline underline-offset-2">
            {headline}
          </h3>
          <div className="flex shrink-0 items-center gap-1 text-sm font-medium">
            {pricingRule ? (
              <>
                <Star className="h-3.5 w-3.5 fill-foreground text-foreground" />
                <span>{score}</span>
                <span className="text-muted-foreground font-normal">
                  ({reviews})
                </span>
              </>
            ) : (
              <Badge
                variant="secondary"
                className="font-medium text-xs rounded-md"
              >
                New
              </Badge>
            )}
          </div>
        </div>

        <p className="text-muted-foreground text-sm line-clamp-1">{title}</p>

        <p className="text-muted-foreground text-sm">
          {business ? "Business host" : "Private host"}
        </p>

        {dateLine ? (
          <p className="text-muted-foreground text-sm">{dateLine}</p>
        ) : null}

        {pricingRule && tripTotal != null ? (
          <div className="mt-0.5">
            <span className="font-semibold text-foreground">
              {formatPrice(tripTotal, pricingRule.currency)} total
            </span>
            <p className="text-muted-foreground text-xs mt-0.5">
              {listing.id.charCodeAt(0) % 2 === 0
                ? "Pay €0 today"
                : "Free cancellation"}
            </p>
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

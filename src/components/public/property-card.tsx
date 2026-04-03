"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Heart, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

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
}

/** Placeholder guest rating until reviews exist (UX parity with major marketplaces). */
function demoRating(id: string): { score: string; label: string } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const score = (4.7 + (h % 30) / 100).toFixed(2);
  return { score, label: "Guest favorite" };
}

export function PropertyCard({ listing }: PropertyCardProps) {
  const { slug, title, property, images, pricingRule } = listing;
  const coverImage = images[0];
  const locationLabel = property.area ? `${property.area}, ${property.city}` : property.city;
  const { score, label } = demoRating(listing.id);
  const [saved, setSaved] = useState(false);

  return (
    <div>
      <div className="relative">
        <Link href={`/properties/${slug}`} className="group block">
          <div className="relative aspect-[20/19] overflow-hidden rounded-xl bg-muted shadow-sm ring-1 ring-black/5 transition-shadow duration-200 group-hover:shadow-md">
            {coverImage ? (
              <Image
                src={coverImage.url}
                alt={coverImage.alt || title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                No photos
              </div>
            )}
          </div>
        </Link>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className={cn(
            "absolute top-3 right-3 h-8 w-8 rounded-full border-0 bg-background/90 hover:bg-background shadow-sm z-10",
            saved && "text-rose-600"
          )}
          aria-label={saved ? "Remove from saved" : "Save listing"}
          onClick={(e) => {
            e.preventDefault();
            setSaved((s) => !s);
          }}
        >
          <Heart className={cn("h-4 w-4", saved && "fill-current")} />
        </Button>
      </div>

      <Link href={`/properties/${slug}`} className="block mt-2 space-y-0.5 group">
        <div className="flex items-center justify-between gap-1.5">
          <p className="text-[13px] font-medium line-clamp-1 text-foreground group-hover:underline underline-offset-2">
            {locationLabel}
          </p>
          <span className="flex items-center gap-0.5 shrink-0 text-[13px] text-foreground">
            <Star className="h-3 w-3 fill-foreground" />
            <span>{score}</span>
          </span>
        </div>
        <p className="text-[13px] text-muted-foreground line-clamp-1">{title}</p>
        {pricingRule && (
          <p className="text-[13px]">
            <span className="font-semibold">
              {formatPrice(Number(pricingRule.baseNightlyRate), pricingRule.currency)}
            </span>
            <span className="text-muted-foreground"> / night</span>
          </p>
        )}
      </Link>
    </div>
  );
}

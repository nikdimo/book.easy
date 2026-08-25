"use client";

import Link from "next/link";
import { useState } from "react";
import { Grid } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ListingMediaItem } from "@/lib/types/listing-media";
import { cn } from "@/lib/utils";
import { useSwipe } from "@/lib/hooks/use-swipe";
import { useProgressivePreload } from "@/lib/hooks/use-progressive-preload";
import { Tx, useI18n } from "@/lib/i18n/client";
import { GalleryMedia, PreloadImages, preloadIndicesFor } from "./gallery-media";

interface ImageGalleryProps {
  images: ListingMediaItem[];
  slug: string;
}

/** Most dots to draw at once. Past this the row stops reading as "how many
 * photos" and turns into a smear, so it becomes a sliding window and the count
 * pill carries the actual number. */
const DOT_WINDOW = 5;

function dotWindow(active: number, total: number): { start: number; end: number } {
  if (total <= DOT_WINDOW) return { start: 0, end: total };
  const start = Math.min(Math.max(active - Math.floor(DOT_WINDOW / 2), 0), total - DOT_WINDOW);
  return { start, end: start + DOT_WINDOW };
}

export function ImageGallery({ images, slug }: ImageGalleryProps) {
  const i18n = useI18n();
  const [heroIndex, setHeroIndex] = useState(0);

  const heroSwipe = useSwipe(
    () => setHeroIndex((i) => (i + 1) % Math.max(images.length, 1)),
    () => setHeroIndex((i) => (i - 1 + Math.max(images.length, 1)) % Math.max(images.length, 1))
  );

  // First 3 photos load eagerly up front; the rest stream in first-to-last in
  // the background so browsing further into the gallery is already instant.
  const loadedUpTo = useProgressivePreload(images.length, 3);

  if (images.length === 0) {
    return (
      <div className="aspect-[16/9] bg-muted rounded-2xl flex items-center justify-center text-muted-foreground ring-1 ring-black/5">
        <Tx k="gallery.no_media" source="No media available" />
      </div>
    );
  }

  const tourHref = `/properties/${slug}/photos`;
  const photoHref = (index: number) => `${tourHref}?photo=${index}`;
  const mainImage = images[0];
  const gridImages = images.slice(1, 5);
  const dots = dotWindow(heroIndex, images.length);

  return (
    <div className="relative rounded-2xl overflow-hidden ring-1 ring-black/5">
      {/* Mobile: swipeable single-photo carousel */}
      <Link
        href={photoHref(heroIndex)}
        className="relative block aspect-[4/3] touch-pan-y md:hidden"
        onClickCapture={heroSwipe.onClickCapture}
        onTouchStart={heroSwipe.onTouchStart}
        onTouchEnd={heroSwipe.onTouchEnd}
      >
        <GalleryMedia
          item={images[heroIndex]}
          fill
          fetchPriority="high"
          sizes="100vw"
        />
        <PreloadImages
          images={images}
          indices={preloadIndicesFor(heroIndex, loadedUpTo, images.length)}
        />
        {images.length > 1 && (
          <>
            <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[0.6875rem] font-medium text-white">
              {heroIndex + 1} / {images.length}
            </span>
            <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex items-center justify-center gap-1.5">
              {images.slice(dots.start, dots.end).map((_, offset) => {
                const i = dots.start + offset;
                // The dots at a truncated edge shrink, so the row reads as a
                // window onto a longer strip rather than the whole of it.
                const truncated =
                  (offset === 0 && dots.start > 0) ||
                  (offset === DOT_WINDOW - 1 && dots.end < images.length);
                return (
                  <div
                    key={i}
                    className={cn(
                      "rounded-full bg-white transition-all",
                      i === heroIndex
                        ? "h-1.5 w-4 opacity-100"
                        : truncated
                          ? "h-1 w-1 opacity-50"
                          : "h-1.5 w-1.5 opacity-60"
                    )}
                  />
                );
              })}
            </div>
          </>
        )}
      </Link>

      {/* Desktop: static photo grid */}
      <div
        className={cn(
          "hidden md:grid gap-2",
          gridImages.length > 0 && "md:grid-cols-4 md:grid-rows-2 max-h-[480px]"
        )}
      >
        <Link
          href={photoHref(0)}
          className={cn(
            "relative block aspect-[4/3]",
            gridImages.length > 0 ? "md:col-span-2 md:row-span-2 md:aspect-auto" : "md:aspect-[16/9]"
          )}
        >
          <GalleryMedia
            item={mainImage}
            fill
            fetchPriority="high"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </Link>
        {gridImages.map((img, i) => (
          <Link
            key={img.id}
            href={photoHref(i + 1)}
            className="relative block aspect-[4/3]"
          >
            <GalleryMedia item={img} fill sizes="25vw" />
          </Link>
        ))}
      </div>
      {images.length > 1 && (
        <Button
          variant="outline"
          size="sm"
          className="absolute bottom-4 right-4 rounded-lg border border-black/60 bg-white px-3 py-1.5 text-[0.8rem] font-medium text-black shadow-sm hover:bg-white hover:text-black dark:bg-white dark:text-black dark:border-black/60"
          asChild
        >
          <Link href={tourHref}>
            <Grid className="h-4 w-4 mr-2" />
            {(() => { const value = i18n.plural("gallery.show_all", images.length, "Show all {n} item", "Show all {n} items"); return <span className={value.translated ? "notranslate" : undefined}>{value.text}</span>; })()}
          </Link>
        </Button>
      )}
    </div>
  );
}

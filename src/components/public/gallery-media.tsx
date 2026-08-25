"use client";

import Image from "next/image";
import type { ListingMediaItem } from "@/lib/types/listing-media";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

/** Prev/next indices around `index`, so they can be preloaded and swiping
 * to them is instant instead of waiting on a fresh network fetch. */
export function neighborIndices(index: number, length: number): number[] {
  if (length <= 1) return [];
  const prev = (index - 1 + length) % length;
  const next = (index + 1) % length;
  return prev === next ? [prev] : [prev, next];
}

/** Immediate neighbors (highest priority) plus everything the background
 * progressive loader has reached so far, minus whichever index is on screen. */
export function preloadIndicesFor(current: number, loadedUpTo: number, length: number): number[] {
  const set = new Set(neighborIndices(current, length));
  for (let i = 0; i < loadedUpTo; i++) {
    if (i !== current) set.add(i);
  }
  return Array.from(set);
}

export function GalleryMedia({
  item,
  fill,
  eager,
  fetchPriority,
  sizes,
  contain = false,
}: {
  item: ListingMediaItem;
  fill?: boolean;
  /** Fetch immediately rather than waiting on lazy-load, for off-screen images
   * being warmed up ahead of a swipe. */
  eager?: boolean;
  fetchPriority?: "high" | "low" | "auto";
  sizes?: string;
  contain?: boolean;
}) {
  // Must stay in the `images.qualities` allowlist in next.config.ts, which is what
  // makes this legal at all rather than the 75 every other image on the site gets.
  const QUALITY = 85;
  const i18n = useI18n();
  if (item.mediaType === "VIDEO") {
    return (
      <video
        src={item.url}
        className={cn("h-full w-full", contain ? "object-contain" : "object-cover")}
        controls
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <Image
      src={item.url}
      alt={item.alt || i18n.resolve("gallery.property_photo", "Property photo").text}
      fill={fill}
      className={contain ? "object-contain" : "object-cover"}
      loading={eager ? "eager" : undefined}
      fetchPriority={fetchPriority}
      quality={QUALITY}
      sizes={sizes}
    />
  );
}

/** Invisible, non-interactive copies of photos so the browser has already
 * fetched them by the time they're swiped to. `pointer-events-none` is load
 * bearing here — without it these stack on top of the visible photo and
 * swallow every tap/click meant for it. */
export function PreloadImages({
  images,
  indices,
  contain = false,
}: {
  images: ListingMediaItem[];
  indices: number[];
  contain?: boolean;
}) {
  return (
    <>
      {indices.map((i) => (
        <div
          key={images[i].id}
          className="pointer-events-none absolute inset-0 opacity-0"
          aria-hidden="true"
        >
          <GalleryMedia item={images[i]} fill eager contain={contain} sizes="100vw" />
        </div>
      ))}
    </>
  );
}

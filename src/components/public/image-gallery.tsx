"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight, Grid, X } from "lucide-react";
import type { ListingMediaItem } from "@/lib/types/listing-media";
import { cn } from "@/lib/utils";
import { useSwipe } from "@/lib/hooks/use-swipe";
import { useProgressivePreload } from "@/lib/hooks/use-progressive-preload";

interface ImageGalleryProps {
  images: ListingMediaItem[];
}

/** Prev/next indices around `index`, so they can be preloaded and swiping
 * to them is instant instead of waiting on a fresh network fetch. */
function neighborIndices(index: number, length: number): number[] {
  if (length <= 1) return [];
  const prev = (index - 1 + length) % length;
  const next = (index + 1) % length;
  return prev === next ? [prev] : [prev, next];
}

/** Immediate neighbors (highest priority) plus everything the background
 * progressive loader has reached so far, minus whichever index is on screen. */
function preloadIndicesFor(current: number, loadedUpTo: number, length: number): number[] {
  const set = new Set(neighborIndices(current, length));
  for (let i = 0; i < loadedUpTo; i++) {
    if (i !== current) set.add(i);
  }
  return Array.from(set);
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);

  const closeAll = () => {
    setGalleryOpen(false);
    setActiveIndex(null);
  };

  // Keyboard navigation while viewing a single photo
  useEffect(() => {
    if (activeIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setActiveIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length));
      } else if (e.key === "ArrowRight") {
        setActiveIndex((i) => (i === null ? i : (i + 1) % images.length));
      } else if (e.key === "Escape") {
        setActiveIndex(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, images.length]);

  const heroSwipe = useSwipe(
    () => setHeroIndex((i) => (i + 1) % Math.max(images.length, 1)),
    () => setHeroIndex((i) => (i - 1 + Math.max(images.length, 1)) % Math.max(images.length, 1))
  );

  const viewerSwipe = useSwipe(
    () => setActiveIndex((i) => (i === null ? i : (i + 1) % images.length)),
    () => setActiveIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length))
  );

  // First 3 photos load eagerly up front; the rest stream in first-to-last in
  // the background so browsing further into the gallery is already instant.
  const loadedUpTo = useProgressivePreload(images.length, 3);

  if (images.length === 0) {
    return (
      <div className="aspect-[16/9] bg-muted rounded-2xl flex items-center justify-center text-muted-foreground ring-1 ring-black/5">
        No media available
      </div>
    );
  }

  const mainImage = images[0];
  const gridImages = images.slice(1, 5);

  return (
    <>
      <div className="relative rounded-2xl overflow-hidden ring-1 ring-black/5">
        {/* Mobile: swipeable single-photo carousel */}
        <div
          className="relative aspect-[4/3] cursor-pointer touch-pan-y md:hidden"
          onClick={() => { setGalleryOpen(true); setActiveIndex(heroIndex); }}
          onClickCapture={heroSwipe.onClickCapture}
          onTouchStart={heroSwipe.onTouchStart}
          onTouchEnd={heroSwipe.onTouchEnd}
        >
          <GalleryMedia item={images[heroIndex]} fill preload sizes="100vw" />
          <PreloadImages
            images={images}
            indices={preloadIndicesFor(heroIndex, loadedUpTo, images.length)}
          />
          {images.length > 1 && (
            <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {images.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full bg-white transition-all",
                    i === heroIndex ? "w-4 opacity-100" : "w-1.5 opacity-60"
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Desktop: static photo grid */}
        <div
          className={cn(
            "hidden md:grid gap-2",
            gridImages.length > 0 && "md:grid-cols-4 md:grid-rows-2 max-h-[480px]"
          )}
        >
          <div
            className={cn(
              "relative cursor-pointer aspect-[4/3]",
              gridImages.length > 0 ? "md:col-span-2 md:row-span-2 md:aspect-auto" : "md:aspect-[16/9]"
            )}
            onClick={() => { setGalleryOpen(true); setActiveIndex(0); }}
          >
            <GalleryMedia item={mainImage} fill preload sizes="(max-width: 768px) 100vw, 50vw" />
          </div>
          {gridImages.map((img, i) => (
            <div
              key={img.id}
              className="relative cursor-pointer aspect-[4/3]"
              onClick={() => { setGalleryOpen(true); setActiveIndex(i + 1); }}
            >
              <GalleryMedia item={img} fill sizes="25vw" />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <Button
            variant="secondary"
            size="sm"
            className="absolute bottom-4 right-4"
            onClick={() => { setGalleryOpen(true); setActiveIndex(null); }}
          >
            <Grid className="h-4 w-4 mr-2" />
            Show all {images.length} items
          </Button>
        )}
      </div>

      <Dialog open={galleryOpen} onOpenChange={(open) => (open ? setGalleryOpen(true) : closeAll())}>
        <DialogContent
          showCloseButton={false}
          className="max-w-none sm:max-w-none w-screen h-[100dvh] sm:h-[100dvh] overflow-hidden rounded-none p-0 gap-0 bg-background top-0 left-0 translate-x-0 translate-y-0 sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
        >
          <DialogTitle className="sr-only">
            {activeIndex === null
              ? `All ${images.length} media item${images.length !== 1 ? "s" : ""}`
              : `Media item ${activeIndex + 1} of ${images.length}`}
          </DialogTitle>

          {activeIndex === null ? (
            /* Grid overview, like a Google Photos shared album */
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-6">
                <span className="font-heading text-sm font-medium">
                  {images.length} item{images.length !== 1 ? "s" : ""}
                </span>
                <Button variant="ghost" size="icon-sm" onClick={closeAll}>
                  <X className="h-5 w-5" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2 pb-4 sm:p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {images.map((img, i) => (
                    <button
                      key={img.id}
                      type="button"
                      className="relative aspect-square overflow-hidden rounded-lg ring-1 ring-black/5 transition hover:opacity-90"
                      onClick={() => setActiveIndex(i)}
                    >
                      <GalleryMedia item={img} fill sizes="(max-width: 640px) 50vw, 25vw" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 justify-center border-t bg-background px-4 py-3 sm:py-4">
                <Button variant="outline" className="rounded-full" onClick={closeAll}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to property
                </Button>
              </div>
            </div>
          ) : (
            /* Single photo viewer */
            <div className="relative flex h-full min-w-0 w-full flex-col overflow-hidden bg-black">
              <div className="absolute top-0 right-0 left-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-3 sm:p-4">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white hover:bg-white/20"
                  onClick={() => setActiveIndex(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="sr-only">Back to all media</span>
                </Button>
                <span className="text-sm text-white">
                  {activeIndex + 1} / {images.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white hover:bg-white/20"
                  onClick={closeAll}
                >
                  <X className="h-5 w-5" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>

              <div
                className="relative min-w-0 w-full flex-1 touch-pan-y overflow-hidden"
                onTouchStart={viewerSwipe.onTouchStart}
                onTouchEnd={viewerSwipe.onTouchEnd}
              >
                <GalleryMedia
                  item={images[activeIndex]}
                  fill
                  contain
                  preload
                  sizes="100vw"
                />
                <PreloadImages
                  images={images}
                  indices={preloadIndicesFor(activeIndex, loadedUpTo, images.length)}
                  contain
                />

                {images.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1/2 left-2 -translate-y-1/2 text-white hover:bg-white/20"
                      onClick={() => setActiveIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length))}
                    >
                      <ChevronLeft className="h-6 w-6" />
                      <span className="sr-only">Previous photo</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1/2 right-2 -translate-y-1/2 text-white hover:bg-white/20"
                      onClick={() => setActiveIndex((i) => (i === null ? i : (i + 1) % images.length))}
                    >
                      <ChevronRight className="h-6 w-6" />
                      <span className="sr-only">Next photo</span>
                    </Button>
                  </>
                )}
              </div>

              {/* Filmstrip */}
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto bg-black/80 p-2 sm:p-3">
                  {images.map((img, i) => (
                    <button
                      key={img.id}
                      type="button"
                      className={cn(
                        "relative h-14 w-14 shrink-0 overflow-hidden rounded-md ring-2 transition sm:h-16 sm:w-16",
                        i === activeIndex ? "ring-white" : "ring-transparent opacity-60 hover:opacity-100"
                      )}
                      onClick={() => setActiveIndex(i)}
                    >
                      <GalleryMedia item={img} fill sizes="64px" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function GalleryMedia({
  item,
  fill,
  preload,
  eager,
  sizes,
  contain = false,
}: {
  item: ListingMediaItem;
  fill?: boolean;
  preload?: boolean;
  /** Fetch immediately rather than waiting on lazy-load, for off-screen images
   * being warmed up ahead of a swipe. */
  eager?: boolean;
  sizes?: string;
  contain?: boolean;
}) {
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
      alt={item.alt || "Property photo"}
      fill={fill}
      className={contain ? "object-contain" : "object-cover"}
      preload={preload}
      loading={eager ? "eager" : undefined}
      sizes={sizes}
    />
  );
}

/** Invisible, non-interactive copies of photos so the browser has already
 * fetched them by the time they're swiped to. `pointer-events-none` is load
 * bearing here — without it these stack on top of the visible photo and
 * swallow every tap/click meant for it. */
function PreloadImages({
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

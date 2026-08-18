"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight, Grid, X } from "lucide-react";
import type { ListingMediaItem } from "@/lib/types/listing-media";
import { cn } from "@/lib/utils";
import { useSwipe } from "@/lib/hooks/use-swipe";
import { usePhotoGestures } from "@/lib/hooks/use-photo-gestures";
import { useProgressivePreload } from "@/lib/hooks/use-progressive-preload";
import { Tx, useI18n } from "@/lib/i18n/client";

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
  const i18n = useI18n();
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  /** Whether the viewer was reached through the grid overview, so "back" can
   * return where the visitor actually came from instead of always to the grid. */
  const [cameFromGrid, setCameFromGrid] = useState(false);
  /** Top bar and filmstrip, hidden after a moment on touch so the photo owns
   * the whole screen. Tapping the photo brings them back. */
  const [chromeVisible, setChromeVisible] = useState(true);
  const filmstripRef = useRef<HTMLDivElement | null>(null);
  const photoRef = useRef<HTMLDivElement | null>(null);

  const closeAll = () => {
    setGalleryOpen(false);
    setActiveIndex(null);
  };

  const gestures = usePhotoGestures({
    containerRef: photoRef,
    onNext: () => showPhotoAt((i) => (i + 1) % images.length),
    onPrev: () => showPhotoAt((i) => (i - 1 + images.length) % images.length),
    onDismiss: closeAll,
    onTap: () => setChromeVisible((visible) => !visible),
  });
  const { reset: resetZoom } = gestures;

  /** Every photo change starts unzoomed, with the chrome briefly visible so the
   * position counter and filmstrip are readable before they fade away. */
  const showPhotoAt = useCallback(
    (index: number | ((current: number) => number)) => {
      setActiveIndex((current) =>
        typeof index === "function" ? (current === null ? current : index(current)) : index
      );
      resetZoom();
      setChromeVisible(true);
    },
    [resetZoom]
  );

  const showPhoto = (index: number, fromGrid: boolean) => {
    setCameFromGrid(fromGrid);
    setGalleryOpen(true);
    showPhotoAt(index);
  };

  const goBack = () => (cameFromGrid ? setActiveIndex(null) : closeAll());

  const nextPhoto = () => showPhotoAt((i) => (i + 1) % images.length);
  const prevPhoto = () => showPhotoAt((i) => (i - 1 + images.length) % images.length);

  // Keyboard navigation while viewing a single photo. Escape is left to the
  // dialog itself, which closes the whole thing.
  useEffect(() => {
    if (activeIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        showPhotoAt((i) => (i - 1 + images.length) % images.length);
      } else if (e.key === "ArrowRight") {
        showPhotoAt((i) => (i + 1) % images.length);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, images.length, showPhotoAt]);

  useEffect(() => {
    if (activeIndex === null || !chromeVisible) return;
    const timer = setTimeout(() => setChromeVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [activeIndex, chromeVisible]);

  // Keep the active thumbnail centred in the filmstrip as photos change.
  useEffect(() => {
    if (activeIndex === null) return;
    const strip = filmstripRef.current;
    const thumb = strip?.children[activeIndex] as HTMLElement | undefined;
    if (!strip || !thumb) return;
    strip.scrollTo({
      left: thumb.offsetLeft - (strip.clientWidth - thumb.clientWidth) / 2,
      behavior: "smooth",
    });
  }, [activeIndex]);

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

  const mainImage = images[0];
  const gridImages = images.slice(1, 5);

  return (
    <>
      <div className="relative rounded-2xl overflow-hidden ring-1 ring-black/5">
        {/* Mobile: swipeable single-photo carousel */}
        <div
          className="relative aspect-[4/3] cursor-pointer touch-pan-y md:hidden"
          onClick={() => showPhoto(heroIndex, false)}
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
            onClick={() => showPhoto(0, false)}
          >
            <GalleryMedia
              item={mainImage}
              fill
              fetchPriority="high"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          {gridImages.map((img, i) => (
            <div
              key={img.id}
              className="relative cursor-pointer aspect-[4/3]"
              onClick={() => showPhoto(i + 1, false)}
            >
              <GalleryMedia item={img} fill sizes="25vw" />
            </div>
          ))}
        </div>
        {images.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            className="absolute bottom-4 right-4 rounded-lg border border-black/60 bg-white px-3 py-1.5 text-[0.8rem] font-medium text-black shadow-sm hover:bg-white hover:text-black dark:bg-white dark:text-black dark:border-black/60"
            onClick={() => { setCameFromGrid(false); setGalleryOpen(true); setActiveIndex(null); }}
          >
            <Grid className="h-4 w-4 mr-2" />
            {(() => { const value = i18n.plural("gallery.show_all", images.length, "Show all {n} item", "Show all {n} items"); return <span className={value.translated ? "notranslate" : undefined}>{value.text}</span>; })()}
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
              ? (() => { const value = i18n.plural("gallery.all_media", images.length, "All {n} media item", "All {n} media items"); return <span className={value.translated ? "notranslate" : undefined}>{value.text}</span>; })()
              : (() => { const value = i18n.resolve("gallery.media_position", "Media item {current} of {total}"); const text = value.text.replace("{current}", String(activeIndex + 1)).replace("{total}", String(images.length)); return <span className={value.translated ? "notranslate" : undefined}>{text}</span>; })()}
          </DialogTitle>

          {activeIndex === null ? (
            /* Grid overview, like a Google Photos shared album */
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-6">
                <span className="font-heading text-sm font-medium">
                  {(() => { const value = i18n.plural("gallery.items", images.length, "{n} item", "{n} items"); return <span className={value.translated ? "notranslate" : undefined}>{value.text}</span>; })()}
                </span>
                <Button variant="ghost" size="icon-sm" onClick={closeAll}>
                  <X className="h-5 w-5" />
                  <span className="sr-only"><Tx k="common.close" source="Close" /></span>
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2 pb-4 sm:p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {images.map((img, i) => (
                    <button
                      key={img.id}
                      type="button"
                      className="relative aspect-square overflow-hidden rounded-lg ring-1 ring-black/5 transition hover:opacity-90"
                      onClick={() => showPhoto(i, true)}
                    >
                      <GalleryMedia item={img} fill sizes="(max-width: 640px) 50vw, 25vw" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 justify-center border-t bg-background px-4 py-3 sm:py-4">
                <Button variant="outline" className="rounded-full" onClick={closeAll}>
                  <ArrowLeft className="h-4 w-4" />
                  <Tx k="gallery.back_property" source="Back to property" />
                </Button>
              </div>
            </div>
          ) : (
            /* Single photo viewer — the photo owns the whole screen and every
               control floats over it. */
            <div className="relative h-full min-w-0 w-full overflow-hidden bg-black">
              <div
                ref={photoRef}
                className="absolute inset-0 touch-none overflow-hidden"
                onTouchStart={gestures.handlers.onTouchStart}
                onTouchMove={gestures.handlers.onTouchMove}
                onTouchEnd={gestures.handlers.onTouchEnd}
              >
                <div className="absolute inset-0" style={gestures.style}>
                  <GalleryMedia
                    item={images[activeIndex]}
                    fill
                    contain
                    eager
                    fetchPriority="high"
                    sizes="100vw"
                  />
                </div>
                <PreloadImages
                  images={images}
                  indices={preloadIndicesFor(activeIndex, loadedUpTo, images.length)}
                  contain
                />
              </div>

              <div
                className={cn(
                  "absolute top-0 right-0 left-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-3 transition-opacity duration-300 sm:p-4",
                  chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
                  "md:pointer-events-auto md:opacity-100"
                )}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white hover:bg-white/20"
                  onClick={goBack}
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="sr-only">
                    {cameFromGrid ? (
                      <Tx k="gallery.back_all" source="Back to all media" />
                    ) : (
                      <Tx k="gallery.back_property" source="Back to property" />
                    )}
                  </span>
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
                  <span className="sr-only"><Tx k="common.close" source="Close" /></span>
                </Button>
              </div>

              {/* Arrows are pointer affordances only — on touch the photo is swiped. */}
              {images.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1/2 left-2 z-10 hidden -translate-y-1/2 text-white hover:bg-white/20 md:inline-flex"
                    onClick={prevPhoto}
                  >
                    <ChevronLeft className="h-6 w-6" />
                    <span className="sr-only"><Tx k="gallery.previous" source="Previous photo" /></span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1/2 right-2 z-10 hidden -translate-y-1/2 text-white hover:bg-white/20 md:inline-flex"
                    onClick={nextPhoto}
                  >
                    <ChevronRight className="h-6 w-6" />
                    <span className="sr-only"><Tx k="gallery.next" source="Next photo" /></span>
                  </Button>
                </>
              )}

              {/* Filmstrip, scrolled to follow the photo on screen */}
              {images.length > 1 && (
                <div
                  ref={filmstripRef}
                  className={cn(
                    "absolute right-0 bottom-0 left-0 z-10 flex gap-2 overflow-x-auto bg-gradient-to-t from-black/80 to-transparent p-2 transition-opacity duration-300 sm:p-3",
                    chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
                    "md:pointer-events-auto md:opacity-100"
                  )}
                >
                  {images.map((img, i) => (
                    <button
                      key={img.id}
                      type="button"
                      className={cn(
                        "relative h-14 w-14 shrink-0 overflow-hidden rounded-md ring-2 transition sm:h-16 sm:w-16",
                        i === activeIndex ? "ring-white" : "ring-transparent opacity-60 hover:opacity-100"
                      )}
                      onClick={() => showPhotoAt(i)}
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

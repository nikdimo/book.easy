"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WheelEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ListingMediaItem } from "@/lib/types/listing-media";
import { cn } from "@/lib/utils";
import { usePhotoGestures } from "@/lib/hooks/use-photo-gestures";
import { useProgressivePreload } from "@/lib/hooks/use-progressive-preload";
import { Tx, useI18n } from "@/lib/i18n/client";
import { createPhotoWheelState, photoStepFromWheel } from "@/lib/photo-viewer-input";
import { GalleryMedia, PreloadImages, preloadIndicesFor } from "./gallery-media";

interface PhotoTourProps {
  slug: string;
  images: ListingMediaItem[];
}

/** Which photo the viewer is showing, or null for the grid overview. Driven by
 * the URL rather than component state so a single photo is linkable, and so the
 * back button steps viewer -> grid -> listing instead of leaving the site the
 * way a dialog does. */
function activeIndexFrom(raw: string | null, length: number): number | null {
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= length) return null;
  return parsed;
}

export function PhotoTour({ slug, images }: PhotoTourProps) {
  const i18n = useI18n();
  const searchParams = useSearchParams();
  const activeIndex = activeIndexFrom(searchParams.get("photo"), images.length);
  const activeIsPanorama =
    activeIndex !== null && images[activeIndex]?.isPanorama === true;

  const listingHref = `/properties/${slug}`;
  const filmstripRef = useRef<HTMLDivElement | null>(null);
  const photoRef = useRef<HTMLDivElement | null>(null);
  const wheelStateRef = useRef(createPhotoWheelState());
  /** Whether this session pushed the viewer onto the history stack. A visitor who
   * landed straight on a shared `?photo=` link has no grid entry behind them, so
   * closing has to rewrite the URL rather than step back off the site. */
  const pushedViewer = useRef(false);

  /** Top-bar buttons and the filmstrip, hidden after a moment on touch so the
   * photo owns the whole screen; tapping brings them back. The position counter
   * is deliberately not part of this — it is the one thing that says more photos
   * exist, so it never fades. */
  const [chromeVisible, setChromeVisible] = useState(true);

  // Declared before the navigation callbacks it calls into, which is safe because
  // these arrows only ever run from a later event — and it is the only order that
  // works, since those callbacks in turn need `reset` from this hook.
  const gestures = usePhotoGestures({
    containerRef: photoRef,
    onNext: () => step(1),
    onPrev: () => step(-1),
    onDismiss: () => closePhoto(),
    onTap: () => setChromeVisible((visible) => !visible),
  });
  const { reset: resetZoom } = gestures;

  // Opening pushes, so back returns to the grid; moving between photos replaces,
  // so back doesn't have to walk every photo the visitor looked at on the way.
  // Both land on a fresh photo: unzoomed, with the chrome briefly up so the
  // filmstrip is readable before it fades again.
  const openPhoto = useCallback(
    (index: number) => {
      window.history.pushState(null, "", `?photo=${index}`);
      pushedViewer.current = true;
      resetZoom();
      setChromeVisible(true);
    },
    [resetZoom]
  );

  const showPhoto = useCallback(
    (index: number) => {
      window.history.replaceState(null, "", `?photo=${index}`);
      resetZoom();
      setChromeVisible(true);
    },
    [resetZoom]
  );

  const closePhoto = useCallback(() => {
    if (pushedViewer.current) {
      pushedViewer.current = false;
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const step = useCallback(
    (delta: number) => {
      if (activeIndex === null) return;
      showPhoto((activeIndex + delta + images.length) % images.length);
    },
    [activeIndex, images.length, showPhoto]
  );

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      // Ctrl+wheel is a browser/trackpad pinch gesture; leave page zoom alone.
      // The panorama owns its wheel for zoom. A zoom gesture must never also jump to
      // the next gallery item underneath it.
      if (images.length < 2 || event.ctrlKey || activeIsPanorama) return;

      const direction = photoStepFromWheel(wheelStateRef.current, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        timeStamp: event.timeStamp,
        pageHeight: window.innerHeight,
      });
      if (direction !== 0) step(direction);
    },
    [activeIsPanorama, images.length, step]
  );

  useEffect(() => {
    if (activeIndex === null || !chromeVisible) return;
    const timer = setTimeout(() => setChromeVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [activeIndex, chromeVisible]);

  useEffect(() => {
    if (activeIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === " " && !e.repeat) {
        // Preserve native Space activation for a focused button or link. Everywhere
        // else, prevent the browser's scroll action and advance the gallery.
        if (
          e.target instanceof Element &&
          e.target.closest("button, a, input, textarea, select")
        ) {
          return;
        }
        e.preventDefault();
        step(1);
      } else if (e.key === "Escape") closePhoto();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, step, closePhoto]);

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

  // First 3 photos load eagerly up front; the rest stream in first-to-last in
  // the background so browsing further into the gallery is already instant.
  const loadedUpTo = useProgressivePreload(images.length, 3);

  if (activeIndex === null) {
    /* Grid overview — a catalogue of photos rather than one photo being looked
       at, so it keeps the light surface. Only the viewer below goes black. */
    return (
      <div className="flex h-dvh min-h-0 flex-col bg-background">
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-3 sm:px-6">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={listingHref}>
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">
                <Tx k="gallery.back_property" source="Back to property" />
              </span>
            </Link>
          </Button>
          <span className="font-heading text-sm font-medium">
            {(() => { const value = i18n.plural("gallery.items", images.length, "{n} item", "{n} items"); return <span className={value.translated ? "notranslate" : undefined}>{value.text}</span>; })()}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 pb-4 sm:p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                /* 4:3 rather than square. A square tile is the fair compromise only
                   when orientations are evenly mixed; measured against the actual
                   upload directory this library is 88% landscape, so square was
                   shaving the sides off almost every photo to accommodate a
                   minority. Portrait shots crop harder now, which is the right
                   trade at that ratio. */
                className="relative aspect-[4/3] overflow-hidden rounded-lg ring-1 ring-black/5 transition hover:opacity-90"
                onClick={() => openPhoto(i)}
              >
                <GalleryMedia item={img} fill sizes="(max-width: 640px) 50vw, 25vw" />
              </button>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 justify-center border-t bg-background px-4 py-3 sm:py-4">
          <Button variant="outline" className="rounded-full" asChild>
            <Link href={listingHref}>
              <ArrowLeft className="h-4 w-4" />
              <Tx k="gallery.back_property" source="Back to property" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  /* Arrows are available at every width — they used to be `hidden md:inline-flex`,
     which left a phone or a narrow window with no visible way forward. They ride
     the same fade as the rest of the chrome on touch, stay pinned inside the
     viewport (inset from the edge, never a negative offset), and keep the 44px
     hit target. Positioned against the viewer element, which is the usable photo
     area, so they follow the image rather than drifting off a narrow screen. */
  const arrowClass = cn(
    "absolute top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 rounded-full bg-white text-black shadow-md transition-opacity duration-300 hover:bg-white/90 hover:text-black",
    chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
    "md:pointer-events-auto md:opacity-100"
  );

  /* Single photo — full black, edge to edge. Black is chromatically neutral, so
     it neither tints the photo nor lets the letterboxing on a portrait shot read
     as broken layout, and every control floats over it. */
  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-black"
      onWheel={handleWheel}
    >
      <div
        ref={photoRef}
        className="absolute inset-0 touch-none overflow-hidden"
        onTouchStart={activeIsPanorama ? undefined : gestures.handlers.onTouchStart}
        onTouchMove={activeIsPanorama ? undefined : gestures.handlers.onTouchMove}
        onTouchEnd={activeIsPanorama ? undefined : gestures.handlers.onTouchEnd}
      >
        <div
          className="absolute inset-0"
          style={activeIsPanorama ? undefined : gestures.style}
        >
          <GalleryMedia
            item={images[activeIndex]}
            fill
            contain
            panoramaInteractive
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

      {/* Never fades: the counter is the whole answer to "is there a photo 2?" */}
      <div className="pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white sm:top-4">
        <span className="notranslate">{`${activeIndex + 1} / ${images.length}`}</span>
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
          className="text-white hover:bg-white/20 hover:text-white"
          onClick={closePhoto}
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="sr-only">
            <Tx k="gallery.back_all" source="Back to all media" />
          </span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-white hover:bg-white/20 hover:text-white"
          asChild
        >
          <Link href={listingHref}>
            <X className="h-5 w-5" />
            <span className="sr-only"><Tx k="common.close" source="Close" /></span>
          </Link>
        </Button>
      </div>

      {/* Solid white discs, not bare chevrons: a white glyph with nothing behind
          it vanishes over a bright photo, which is exactly how a gallery ends up
          looking like it holds a single image. */}
      {images.length > 1 && (
        <>
          <Button
            size="icon"
            className={cn(arrowClass, "left-2 sm:left-3")}
            onClick={() => step(-1)}
          >
            <ChevronLeft className="h-6 w-6" />
            <span className="sr-only"><Tx k="gallery.previous" source="Previous photo" /></span>
          </Button>
          <Button
            size="icon"
            className={cn(arrowClass, "right-2 sm:right-3")}
            onClick={() => step(1)}
          >
            <ChevronRight className="h-6 w-6" />
            <span className="sr-only"><Tx k="gallery.next" source="Next photo" /></span>
          </Button>
        </>
      )}

      {images.length > 1 && (
        <div
          className={cn(
            "absolute right-0 bottom-0 left-0 z-10 transition-opacity duration-300",
            chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
            "md:pointer-events-auto md:opacity-100"
          )}
        >
          <div
            ref={filmstripRef}
            className="flex gap-2 overflow-x-auto bg-gradient-to-t from-black/80 to-transparent p-2 sm:p-3"
          >
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                className={cn(
                  "relative h-14 w-14 shrink-0 overflow-hidden rounded-md ring-2 transition sm:h-16 sm:w-16",
                  i === activeIndex ? "ring-white" : "ring-transparent opacity-60 hover:opacity-100"
                )}
                onClick={() => showPhoto(i)}
              >
                <GalleryMedia item={img} fill sizes="64px" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

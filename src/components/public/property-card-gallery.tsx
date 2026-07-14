"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Heart, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toggleFavorite } from "@/lib/actions/favorite.actions";
import { toast } from "sonner";
import { useSwipe } from "@/lib/hooks/use-swipe";
import { useProgressivePreload } from "@/lib/hooks/use-progressive-preload";

interface PropertyCardGalleryProps {
  href: string;
  title: string;
  images: { url: string; alt?: string | null }[];
  listingId: string;
  initialSaved: boolean;
  isAuthenticated: boolean;
}

/** The only genuinely interactive part of a property card — hover-cycling photos, a
 * save/heart toggle — split out so the rest of the card (headline, price, badges) can
 * be a server component with no client JS shipped for it. */
export function PropertyCardGallery({
  href,
  title,
  images,
  listingId,
  initialSaved,
  isAuthenticated,
}: PropertyCardGalleryProps) {
  const router = useRouter();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [saved, setSaved] = useState(initialSaved);
  const [hasBrowsedPhotos, setHasBrowsedPhotos] = useState(false);
  const [, startTransition] = useTransition();

  const safeIndex = Math.min(currentImageIndex, Math.max(0, images.length - 1));
  const cover = images[safeIndex];
  const hasMultiple = images.length > 1;

  function goToImage(updater: (prev: number) => number) {
    setHasBrowsedPhotos(true);
    setCurrentImageIndex(updater);
  }

  const swipe = useSwipe(
    () => goToImage((p) => (p + 1) % Math.max(images.length, 1)),
    () => goToImage((p) => (p - 1 + Math.max(images.length, 1)) % Math.max(images.length, 1))
  );

  // First 3 photos load eagerly up front. With a search page full of cards,
  // warming a whole gallery per card would waste bandwidth on photos most
  // users never see — so the rest only start streaming in once this card's
  // photos have actually been browsed at least once.
  const loadedUpTo = useProgressivePreload(images.length, 3, hasBrowsedPhotos);

  // Immediate neighbors (highest priority) plus everything preloaded so far,
  // preloaded off-screen so a swipe shows them instantly.
  const preloadIndices = (() => {
    if (images.length <= 1) return [];
    const indices = new Set([
      (safeIndex - 1 + images.length) % images.length,
      (safeIndex + 1) % images.length,
    ]);
    for (let i = 0; i < loadedUpTo; i++) {
      if (i !== safeIndex) indices.add(i);
    }
    return Array.from(indices);
  })();

  function handleToggleSaved() {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await toggleFavorite(listingId);
      if (result?.error) {
        setSaved(!next);
        toast.error(result.error);
      }
    });
  }

  return (
    <div
      className="group relative aspect-[20/19] touch-pan-y overflow-hidden rounded-xl bg-muted sm:aspect-[4/3]"
      onClickCapture={swipe.onClickCapture}
      onTouchStart={hasMultiple ? swipe.onTouchStart : undefined}
      onTouchEnd={hasMultiple ? swipe.onTouchEnd : undefined}
    >
      <Link href={href} className="absolute inset-0 z-0">
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

      {preloadIndices.map((i) => (
        <div
          key={images[i].url + i}
          className="pointer-events-none absolute inset-0 opacity-0"
          aria-hidden="true"
        >
          <Image
            src={images[i].url}
            alt=""
            fill
            loading="eager"
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 35vw"
          />
        </div>
      ))}

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
          handleToggleSaved();
        }}
      >
        <Heart
          className={cn(
            "h-6 w-6 transition-colors",
            saved ? "fill-primary text-primary" : "fill-black/20 text-white drop-shadow-sm"
          )}
          strokeWidth={1.5}
        />
      </Button>

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goToImage((p) => (p - 1 + images.length) % images.length);
            }}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-black opacity-0 shadow-sm transition-all hover:scale-105 hover:bg-white group-hover:opacity-100"
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              goToImage((p) => (p + 1) % images.length);
            }}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-black opacity-0 shadow-sm transition-all hover:scale-105 hover:bg-white group-hover:opacity-100"
            aria-label="Next photo"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}

      {hasMultiple && (
        <div className="pointer-events-none absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-[5]">
          {images.map((_, i) => (
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
  );
}

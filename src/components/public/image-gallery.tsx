"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronLeft, ChevronRight, Grid, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageGalleryProps {
  images: { id: string; url: string; alt?: string | null }[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

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

  if (images.length === 0) {
    return (
      <div className="aspect-[16/9] bg-muted rounded-2xl flex items-center justify-center text-muted-foreground ring-1 ring-black/5">
        No photos available
      </div>
    );
  }

  const mainImage = images[0];
  const gridImages = images.slice(1, 5);

  return (
    <>
      <div className="relative rounded-2xl overflow-hidden ring-1 ring-black/5">
        <div
          className={cn(
            "grid grid-cols-1 gap-2",
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
            <Image
              src={mainImage.url}
              alt={mainImage.alt || "Property photo"}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          {gridImages.map((img, i) => (
            <div
              key={img.id}
              className="relative cursor-pointer hidden md:block aspect-[4/3]"
              onClick={() => { setGalleryOpen(true); setActiveIndex(i + 1); }}
            >
              <Image
                src={img.url}
                alt={img.alt || "Property photo"}
                fill
                className="object-cover"
                sizes="25vw"
              />
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
            Show all {images.length} photos
          </Button>
        )}
      </div>

      <Dialog open={galleryOpen} onOpenChange={(open) => (open ? setGalleryOpen(true) : closeAll())}>
        <DialogContent
          showCloseButton={false}
          className="max-w-none sm:max-w-none w-screen h-[100dvh] sm:h-[100dvh] rounded-none p-0 gap-0 bg-background top-0 left-0 translate-x-0 translate-y-0 sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
        >
          <DialogTitle className="sr-only">
            {activeIndex === null
              ? `All ${images.length} photo${images.length !== 1 ? "s" : ""}`
              : `Photo ${activeIndex + 1} of ${images.length}`}
          </DialogTitle>

          {activeIndex === null ? (
            /* Grid overview, like a Google Photos shared album */
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
                <span className="font-heading text-sm font-medium">
                  {images.length} photo{images.length !== 1 ? "s" : ""}
                </span>
                <Button variant="ghost" size="icon-sm" onClick={closeAll}>
                  <X className="h-5 w-5" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 sm:p-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {images.map((img, i) => (
                    <button
                      key={img.id}
                      type="button"
                      className="relative aspect-square overflow-hidden rounded-lg ring-1 ring-black/5 transition hover:opacity-90"
                      onClick={() => setActiveIndex(i)}
                    >
                      <Image
                        src={img.url}
                        alt={img.alt || "Property photo"}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, 25vw"
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Single photo viewer */
            <div className="relative flex h-full flex-col bg-black">
              <div className="absolute top-0 right-0 left-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-3 sm:p-4">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-white hover:bg-white/20"
                  onClick={() => setActiveIndex(null)}
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="sr-only">Back to all photos</span>
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

              <div className="relative flex-1">
                <Image
                  src={images[activeIndex].url}
                  alt={images[activeIndex].alt || "Property photo"}
                  fill
                  className="object-contain"
                  sizes="100vw"
                  priority
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
                      <Image
                        src={img.url}
                        alt={img.alt || "Property photo"}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
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

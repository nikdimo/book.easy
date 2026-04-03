"use client";

import Image from "next/image";
import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Grid, X } from "lucide-react";

interface ImageGalleryProps {
  images: { id: string; url: string; alt?: string | null }[];
}

export function ImageGallery({ images }: ImageGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

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
        <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-2 max-h-[480px]">
          <div
            className="md:col-span-2 md:row-span-2 relative cursor-pointer aspect-[4/3] md:aspect-auto"
            onClick={() => { setCurrentIndex(0); setLightboxOpen(true); }}
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
              onClick={() => { setCurrentIndex(i + 1); setLightboxOpen(true); }}
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
            onClick={() => { setCurrentIndex(0); setLightboxOpen(true); }}
          >
            <Grid className="h-4 w-4 mr-2" />
            Show all {images.length} photos
          </Button>
        )}
      </div>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-0 bg-black/95">
          <div className="relative flex items-center justify-center min-h-[60vh]">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-white hover:bg-white/20 z-10"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>

            <Image
              src={images[currentIndex].url}
              alt={images[currentIndex].alt || "Property photo"}
              width={1200}
              height={800}
              className="max-h-[80vh] w-auto object-contain"
            />

            {images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 text-white hover:bg-white/20"
                  onClick={() => setCurrentIndex((currentIndex - 1 + images.length) % images.length)}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 text-white hover:bg-white/20"
                  onClick={() => setCurrentIndex((currentIndex + 1) % images.length)}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}

            <div className="absolute bottom-4 text-white text-sm">
              {currentIndex + 1} / {images.length}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface PropertyCardSpotlightMediaProps {
  imageUrl: string;
  imageAlt: string;
  videoUrl?: string | null;
  className: string;
}

/** The main collage tile in PropertyCardSpotlight — split out as the only client piece
 * so hovering it can play the listing's first video, same behavior as PropertyCardGallery. */
export function PropertyCardSpotlightMedia({
  imageUrl,
  imageAlt,
  videoUrl,
  className,
}: PropertyCardSpotlightMediaProps) {
  const [isHovering, setIsHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (isHovering) {
      el.currentTime = 0;
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [isHovering]);

  return (
    <div
      className={className}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <Image
        src={imageUrl}
        alt={imageAlt}
        fill
        className="object-cover transition-transform duration-500 group-hover:scale-105"
        sizes="(max-width: 640px) 100vw, 40vw"
      />
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          loop
          playsInline
          preload="none"
          className={cn(
            "pointer-events-none absolute inset-0 z-[1] h-full w-full object-cover transition-opacity duration-300",
            isHovering ? "opacity-100" : "opacity-0"
          )}
        />
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

export function ListingCarouselClient({
  containerId,
}: {
  containerId: string;
}) {
  const i18n = useI18n();
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = document.getElementById(containerId);
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, [containerId]);

  useEffect(() => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const initialCheck = requestAnimationFrame(checkScroll);
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(initialCheck);
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, [checkScroll, containerId]);

  const scroll = (direction: "left" | "right") => {
    const el = document.getElementById(containerId);
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-carousel-card]");
    const step = card ? card.offsetWidth + 16 : 300;
    el.scrollBy({
      left: direction === "left" ? -step * 2 : step * 2,
      behavior: "smooth",
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 group/carousel">
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-8 z-10 flex items-center -translate-x-4">
          <Button
            variant="outline"
            size="icon"
            className="pointer-events-auto h-8 w-8 rounded-full shadow-md bg-background/95 border-border/60 opacity-0 group-hover/carousel:opacity-100 transition-opacity"
            onClick={() => scroll("left")}
            aria-label={i18n.resolve("carousel.scroll_left", "Scroll left").text}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      )}

      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-8 z-10 flex items-center translate-x-4">
          <Button
            variant="outline"
            size="icon"
            className="pointer-events-auto h-8 w-8 rounded-full shadow-md bg-background/95 border-border/60 opacity-0 group-hover/carousel:opacity-100 transition-opacity"
            onClick={() => scroll("right")}
            aria-label={i18n.resolve("carousel.scroll_right", "Scroll right").text}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

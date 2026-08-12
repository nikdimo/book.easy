"use client";

import { useEffect, useState } from "react";
import {
  CompactHomeSearch,
  type HomeSearchData,
} from "@/components/public/compact-home-search";

/**
 * The compact search that takes over once the hero search has scrolled out of sight.
 *
 * Scroll is the only thing that summons it. Map view does *not*: it keeps its own copy
 * of the compact search over the map, because this one is fixed to the top of the
 * viewport and would cover the header.
 */
export function FloatingHomeSearch(props: HomeSearchData) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const heroSearch = document.querySelector("[data-home-hero-search]");
    if (!heroSearch) return;

    const scrollRoot = heroSearch.closest(".overflow-y-auto");
    const scrollTarget: EventTarget = scrollRoot ?? window;
    const updateVisibility = () => {
      const bounds = heroSearch.getBoundingClientRect();
      // The height check matters in map view, where the hero is hidden and every
      // measurement comes back zero — which would otherwise read as "scrolled past".
      setVisible(bounds.height > 0 && bounds.bottom < 0);
    };

    updateVisibility();
    scrollTarget.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);
    return () => {
      scrollTarget.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  return visible ? (
    <div className="fixed inset-x-0 top-0 z-50 flex justify-center border-b bg-background/95 px-4 py-3 shadow-sm backdrop-blur md:top-3 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
      <CompactHomeSearch {...props} />
    </div>
  ) : null;
}

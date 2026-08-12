"use client";

import { useEffect, useState } from "react";
import { MarketplaceSearchBar } from "@/components/marketplace/marketplace-search-bar";
import { cn } from "@/lib/utils";
import { useActiveHomeListingsView } from "@/components/public/home-listings-view-store";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { PlaceOption } from "@/lib/utils/place";

export function FloatingHomeSearch({
  popularCities,
  availablePropertyTypesByCity,
  propertyTypes,
}: {
  popularCities: PlaceOption[];
  availablePropertyTypesByCity: Record<string, string[]>;
  propertyTypes: PropertyTypeOption[];
}) {
  const [scrolledPast, setScrolledPast] = useState(false);
  const view = useActiveHomeListingsView();

  useEffect(() => {
    const heroSearch = document.querySelector("[data-home-hero-search]");
    if (!heroSearch) return;

    const scrollRoot = heroSearch.closest(".overflow-y-auto");
    const scrollTarget: EventTarget = scrollRoot ?? window;
    const updateVisibility = () => {
      const bounds = heroSearch.getBoundingClientRect();
      // All zeros while the hero is hidden for map view — which reads as "not scrolled
      // past", and that is right: `pinnedByMap` below is what shows the bar there.
      setScrolledPast(bounds.bottom < 0 && bounds.height > 0);
    };

    updateVisibility();
    scrollTarget.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);
    return () => {
      scrollTarget.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  // Map view hides the hero, so the search it contained has to come from somewhere —
  // it becomes the compact bar floating over the map, without waiting for a scroll.
  const pinnedByMap = view === "map";
  if (!scrolledPast && !pinnedByMap) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-0 z-50 flex justify-center border-b bg-background/95 px-4 py-3 shadow-sm backdrop-blur md:top-3 md:border-0 md:bg-transparent md:p-0 md:shadow-none",
        // On phones this bar covers the header instead of sitting beside it, which is
        // fine once the header has scrolled away but not while it is still on screen.
        // So map view only pins it on the layouts that have a free middle column.
        pinnedByMap && !scrolledPast && "max-md:hidden",
      )}
    >
      <div className="@container w-full max-w-md md:hidden">
        <MarketplaceSearchBar
          variant="summary"
          popularCities={popularCities}
          availablePropertyTypesByCity={availablePropertyTypesByCity}
          propertyTypes={propertyTypes}
        />
      </div>
      <div className="hidden w-full max-w-[64rem] justify-center md:flex">
        <MarketplaceSearchBar
          variant="floating"
          popularCities={popularCities}
          availablePropertyTypesByCity={availablePropertyTypesByCity}
          propertyTypes={propertyTypes}
        />
      </div>
    </div>
  );
}

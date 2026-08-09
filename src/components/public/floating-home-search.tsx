"use client";

import { useEffect, useState } from "react";
import { MarketplaceSearchBar } from "@/components/marketplace/marketplace-search-bar";
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
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const heroSearch = document.querySelector("[data-home-hero-search]");
    if (!heroSearch) return;

    const scrollRoot = heroSearch.closest(".overflow-y-auto");
    const scrollTarget: EventTarget = scrollRoot ?? window;
    const updateVisibility = () => {
      const bounds = heroSearch.getBoundingClientRect();
      setVisible(bounds.bottom < 0);
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
  ) : null;
}

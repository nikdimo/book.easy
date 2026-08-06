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

    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { threshold: 0 },
    );
    observer.observe(heroSearch);
    return () => observer.disconnect();
  }, []);

  return visible ? (
    <div className="fixed inset-x-0 top-3 z-50 hidden justify-center px-4 md:flex">
      <div className="flex w-full max-w-[64rem] justify-center">
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

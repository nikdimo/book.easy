import { MarketplaceSearchBar } from "@/components/marketplace/marketplace-search-bar";
import { cn } from "@/lib/utils";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { PlaceOption } from "@/lib/utils/place";

export interface HomeSearchData {
  popularCities: PlaceOption[];
  availablePropertyTypesByCity: Record<string, string[]>;
  propertyTypes: PropertyTypeOption[];
}

/**
 * The home search in its small form — the summary trigger on phones, the collapsed
 * floating pill on desktop. Used in the two places the full hero search can't go: the
 * bar that appears once the hero scrolls away, and the overlay on the map view.
 *
 * Both wrappers are `pointer-events-auto` so this can be dropped into a
 * `pointer-events-none` overlay without the surrounding box swallowing clicks meant
 * for whatever is underneath.
 */
export function CompactHomeSearch({
  popularCities,
  availablePropertyTypesByCity,
  propertyTypes,
  desktopClassName,
}: HomeSearchData & {
  /** The desktop wrapper must stay a flex container — the collapsed pill is a
   *  `display: flex` button, so it only sizes to its content as a flex *item*. */
  desktopClassName?: string;
}) {
  return (
    <div className="flex w-full justify-center">
      <div className="pointer-events-auto @container w-full max-w-md md:hidden">
        <MarketplaceSearchBar
          variant="summary"
          popularCities={popularCities}
          availablePropertyTypesByCity={availablePropertyTypesByCity}
          propertyTypes={propertyTypes}
        />
      </div>
      <div
        className={cn(
          "pointer-events-auto hidden w-full max-w-[64rem] justify-center md:flex",
          desktopClassName,
        )}
      >
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

import {
  amenityCategoryOverrideKey,
  shouldDisplayAmenity,
} from "@/lib/amenities/presentation";
import type { CatalogAmenity } from "@/lib/types/amenity-catalog";

/**
 * The rows a picker is allowed to show, with the stable category corrections applied.
 *
 * Shared by the listing editor and the from-scratch flow so both offer exactly the same
 * options: a duplicate that a canonical row supersedes is dropped, and a superseded row
 * stays visible only while it is ticked, so a host can see and remove legacy data rather
 * than have it vanish.
 *
 * Ordering is left alone — the caller groups, and the admin's `sortOrder` decides what
 * comes first. There is deliberately no hardcoded "popular" list here: promoting an
 * amenity is a catalog decision an admin makes in Settings, not one the code makes.
 */
export function displayableAmenities(
  catalog: readonly CatalogAmenity[],
  selected: ReadonlySet<string>,
): CatalogAmenity[] {
  const availableKeys = new Set(catalog.map((amenity) => amenity.key));
  const categories = new Map(
    catalog.map((amenity) => [amenity.category.key, amenity.category]),
  );

  return catalog
    .filter((amenity) =>
      shouldDisplayAmenity(amenity.key, availableKeys, selected.has(amenity.id)),
    )
    .map((amenity) => {
      const overrideKey = amenityCategoryOverrideKey(amenity.key);
      const category = overrideKey ? categories.get(overrideKey) : undefined;
      return category ? { ...amenity, category } : amenity;
    });
}

/** Immutable toggle, so a re-render always sees a new Set. */
export function toggleAmenitySelection(
  selected: ReadonlySet<string>,
  id: string,
): Set<string> {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

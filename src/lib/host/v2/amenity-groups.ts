import type { CatalogAmenity, CatalogCategory } from "@/lib/types/amenity-catalog";

export interface AmenityGroup {
  category: CatalogCategory;
  items: CatalogAmenity[];
}

/**
 * Sorts by the admin's `sortOrder` first and falls back to the English `name`.
 *
 * `label` deliberately plays no part: it is whatever the current locale resolved to, so
 * ordering by it would rearrange the whole picker when a host switches language, and two
 * hosts looking at the same listing would see the categories in different orders.
 */
function byOrderThenName(
  a: { sortOrder: number; name: string },
  b: { sortOrder: number; name: string },
): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

/**
 * Turns the flat catalog into the category sections the Amenities editor renders.
 *
 * The service hands back rows that are *mostly* in order, because the cached query sorts
 * them — but `getAmenityCatalogIncluding` appends this listing's inactive rows after the
 * fact, and those have to land in their own category rather than in a trailing bucket of
 * strays. Re-sorting here rather than trusting the input keeps that append cheap and
 * keeps the grouping honest for any caller.
 *
 * Categories are keyed by id: two of them can legitimately share a `key` after an admin
 * renames one, and merging those would silently fold two sections into one.
 */
export function groupAmenitiesByCategory(
  amenities: readonly CatalogAmenity[],
): AmenityGroup[] {
  const groups = new Map<string, AmenityGroup>();
  for (const amenity of amenities) {
    const group = groups.get(amenity.category.id);
    if (group) group.items.push(amenity);
    else groups.set(amenity.category.id, { category: amenity.category, items: [amenity] });
  }

  const ordered = [...groups.values()];
  ordered.sort((a, b) => byOrderThenName(a.category, b.category));
  for (const group of ordered) group.items.sort(byOrderThenName);
  return ordered;
}

/** The ids the picker is allowed to offer, which is also the set a save is validated
 *  against — a listing can never end up holding an amenity that was not on screen. */
export function pickableAmenityIds(amenities: readonly CatalogAmenity[]): Set<string> {
  return new Set(amenities.map((amenity) => amenity.id));
}

import { amenityDisplayLabel } from "@/lib/amenities/presentation";
import type { AmenityGroup } from "@/lib/host/v2/amenity-groups";
import type { CatalogAmenity } from "@/lib/types/amenity-catalog";

/**
 * TEMPORARY promotion list for the onboarding "Popular amenities" step.
 *
 * The Amenity model has no admin-managed featured/onboarding field yet (checked
 * `prisma/schema.prisma`), so this hardcodes a stable set of *existing* catalog keys
 * purely to choose which already-catalogued rows surface first. It defines no labels,
 * icons, categories or amenities of its own — every row still comes from the live
 * catalog, and a key that no longer resolves is silently skipped by `popularAmenities`
 * below rather than shown as a broken option.
 *
 * The selection favours amenities that decide a booking search — the kind Airbnb's own
 * onboarding leads with — rather than reproducing Airbnb's Basics/Popular/Features
 * taxonomy: our admin-managed categories are untouched, this list only reorders which
 * rows from them show up first.
 *
 * TODO(admin-catalog): once the catalog gains admin-managed `featuredInOnboarding`
 * (boolean) and `onboardingSortOrder` (int) fields, read the promoted set from those
 * instead and delete this list.
 */
const POPULAR_AMENITY_KEYS = [
  "wifi",
  "kitchen",
  "air_conditioning",
  "heating",
  "hot_water",
  "television",
  "washing_machine",
  "clothes_dryer",
  "refrigerator",
  "free_parking",
  "workspace",
  "hair_dryer",
  "swimming_pool",
  "smoke_detector",
  "carbon_monoxide_alarm",
] as const;

/** Picks the promoted rows out of a displayable catalog, in the order configured above.
 *  A key with no matching row (renamed, deactivated, never existed) is dropped rather
 *  than surfaced as a gap. */
export function popularAmenities(
  catalog: readonly CatalogAmenity[],
): CatalogAmenity[] {
  const byKey = new Map(catalog.map((amenity) => [amenity.key, amenity] as const));
  return POPULAR_AMENITY_KEYS.map((key) => byKey.get(key)).filter(
    (amenity): amenity is CatalogAmenity => amenity !== undefined,
  );
}

/** `"all"` and `"selected"` are reserved; anything else is a `CatalogCategory.id`. */
export type AmenityChipFilter = "all" | "selected" | (string & {});

/**
 * Applies the expanded catalog's search box and chip filter to already-grouped
 * amenities, without touching selection state. Search matches the resolved display
 * label, the catalog's source `name`, and the category's resolved `label`/`name` — a
 * category-name hit keeps every row in that category rather than requiring each row to
 * also match individually. Empty categories never survive the filter.
 */
export function filterAmenityGroups(
  groups: readonly AmenityGroup[],
  {
    chip,
    search,
    selected,
  }: { chip: AmenityChipFilter; search: string; selected: ReadonlySet<string> },
): AmenityGroup[] {
  const normalized = search.trim().toLocaleLowerCase();

  return groups
    .filter((group) => chip === "all" || chip === "selected" || group.category.id === chip)
    .map((group) => {
      const categoryMatches =
        normalized.length > 0 &&
        [group.category.label, group.category.name].some((value) =>
          value.toLocaleLowerCase().includes(normalized),
        );
      const items = group.items.filter((amenity) => {
        if (chip === "selected" && !selected.has(amenity.id)) return false;
        if (!normalized || categoryMatches) return true;
        return [amenityDisplayLabel(amenity), amenity.label, amenity.name].some((value) =>
          value.toLocaleLowerCase().includes(normalized),
        );
      });
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);
}

import { describe, expect, it } from "vitest";
import {
  groupAmenitiesByCategory,
  pickableAmenityIds,
} from "@/lib/host/v2/amenity-groups";
import type { CatalogAmenity, CatalogCategory } from "@/lib/types/amenity-catalog";

function category(
  name: string,
  sortOrder: number,
  overrides: Partial<CatalogCategory> = {},
): CatalogCategory {
  return {
    id: `cat-${name.toLowerCase()}`,
    key: name.toLowerCase(),
    name,
    label: name,
    translated: false,
    icon: null,
    sortOrder,
    ...overrides,
  };
}

function amenity(
  name: string,
  cat: CatalogCategory,
  sortOrder: number,
  overrides: Partial<CatalogAmenity> = {},
): CatalogAmenity {
  return {
    id: `am-${name.toLowerCase().replace(/\s+/g, "-")}`,
    key: name.toLowerCase().replace(/\s+/g, "_"),
    name,
    label: name,
    translated: false,
    icon: null,
    sortOrder,
    category: cat,
    ...overrides,
  };
}

const kitchen = category("Kitchen", 10);
const safety = category("Safety", 20);

describe("groupAmenitiesByCategory", () => {
  it("groups amenities under their category and orders both levels by sortOrder", () => {
    const groups = groupAmenitiesByCategory([
      amenity("Smoke detector", safety, 20),
      amenity("Oven", kitchen, 20),
      amenity("Fire extinguisher", safety, 10),
      amenity("Dishwasher", kitchen, 10),
    ]);

    expect(groups.map((group) => group.category.name)).toEqual(["Kitchen", "Safety"]);
    expect(groups[0].items.map((item) => item.name)).toEqual(["Dishwasher", "Oven"]);
    expect(groups[1].items.map((item) => item.name)).toEqual([
      "Fire extinguisher",
      "Smoke detector",
    ]);
  });

  it("breaks a sortOrder tie on the English name, not the translated label", () => {
    const groups = groupAmenitiesByCategory([
      amenity("Oven", kitchen, 10, { label: "Aa first in Macedonian" }),
      amenity("Blender", kitchen, 10, { label: "Zz last in Macedonian" }),
    ]);

    expect(groups[0].items.map((item) => item.name)).toEqual(["Blender", "Oven"]);
  });

  it("places an inactive amenity appended after the active catalog into its own category", () => {
    // getAmenityCatalogIncluding() appends this listing's hidden rows after the sorted
    // catalog, so the trailing row must still land beside its siblings.
    const groups = groupAmenitiesByCategory([
      amenity("Dishwasher", kitchen, 10),
      amenity("Smoke detector", safety, 10),
      amenity("Retired blender", kitchen, 5),
    ]);

    expect(groups.map((group) => group.category.name)).toEqual(["Kitchen", "Safety"]);
    expect(groups[0].items.map((item) => item.name)).toEqual([
      "Retired blender",
      "Dishwasher",
    ]);
  });

  it("keeps two categories apart when a rename left them sharing a key", () => {
    const renamed = category("Kitchen", 15, { id: "cat-kitchen-2", key: "kitchen" });
    const groups = groupAmenitiesByCategory([
      amenity("Oven", kitchen, 10),
      amenity("Toaster", renamed, 10),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.category.id)).toEqual([
      "cat-kitchen",
      "cat-kitchen-2",
    ]);
  });

  it("returns nothing for an empty catalog", () => {
    expect(groupAmenitiesByCategory([])).toEqual([]);
  });
});

describe("pickableAmenityIds", () => {
  it("collects every id the picker renders", () => {
    const ids = pickableAmenityIds([
      amenity("Oven", kitchen, 10),
      amenity("Smoke detector", safety, 10),
    ]);

    expect([...ids].sort()).toEqual(["am-oven", "am-smoke-detector"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  filterAmenityGroups,
  popularAmenities,
} from "@/lib/host/v2/amenity-onboarding";
import { groupAmenitiesByCategory } from "@/lib/host/v2/amenity-groups";
import type { CatalogAmenity, CatalogCategory } from "@/lib/types/amenity-catalog";

function category(
  key: string,
  name: string,
  sortOrder: number,
  overrides: Partial<CatalogCategory> = {},
): CatalogCategory {
  return {
    id: `cat-${key}`,
    key,
    name,
    label: name,
    translated: false,
    icon: null,
    sortOrder,
    ...overrides,
  };
}

function amenity(
  key: string,
  name: string,
  cat: CatalogCategory,
  overrides: Partial<CatalogAmenity> = {},
): CatalogAmenity {
  return {
    id: `am-${key}`,
    key,
    name,
    label: name,
    translated: false,
    icon: null,
    sortOrder: 0,
    category: cat,
    ...overrides,
  };
}

const essentials = category("essentials", "Essentials", 10);
const kitchenCat = category("kitchen", "Kitchen", 40);
const safety = category("safety", "Safety", 100);

describe("popularAmenities", () => {
  it("keeps the configured promotion order regardless of catalog order", () => {
    // "kitchen" is configured before "heating" in the promotion list, so it must lead
    // even though the catalog itself lists it last.
    const catalog: CatalogAmenity[] = [
      amenity("heating", "Heating", essentials),
      amenity("wifi", "Wi-Fi", essentials),
      amenity("kitchen", "Full kitchen", kitchenCat),
    ];

    expect(popularAmenities(catalog).map((a) => a.key)).toEqual([
      "wifi",
      "kitchen",
      "heating",
    ]);
  });

  it("drops promoted keys the catalog doesn't have, without inventing a row", () => {
    // "workspace" and "hair_dryer" are on the promotion list but not in this catalog
    // slice (e.g. deactivated, or renamed) — they must simply be absent, not stubbed.
    const catalog: CatalogAmenity[] = [amenity("wifi", "Wi-Fi", essentials)];

    const result = popularAmenities(catalog);
    expect(result.map((a) => a.key)).toEqual(["wifi"]);
    expect(result.every((a) => a.key !== "workspace" && a.key !== "hair_dryer")).toBe(
      true,
    );
  });

  it("returns nothing for a catalog with no promoted rows", () => {
    const catalog: CatalogAmenity[] = [amenity("balcony", "Balcony", essentials)];
    expect(popularAmenities(catalog)).toEqual([]);
  });
});

describe("filterAmenityGroups", () => {
  const groups = groupAmenitiesByCategory([
    amenity("wifi", "Wi-Fi", essentials, { sortOrder: 10 }),
    amenity("heating", "Heating", essentials, { sortOrder: 20 }),
    amenity("kitchen", "Full kitchen", kitchenCat, { sortOrder: 10 }),
    amenity("smoke_detector", "Smoke detector", safety, { sortOrder: 10 }),
  ]);

  it("returns every group and row for the \"all\" chip with no search", () => {
    const result = filterAmenityGroups(groups, {
      chip: "all",
      search: "",
      selected: new Set(),
    });

    expect(result.map((g) => g.category.key)).toEqual(["essentials", "kitchen", "safety"]);
    expect(result.flatMap((g) => g.items.map((i) => i.key))).toEqual([
      "wifi",
      "heating",
      "kitchen",
      "smoke_detector",
    ]);
  });

  it("filters to a single category without changing what's selectable elsewhere", () => {
    const result = filterAmenityGroups(groups, {
      chip: "cat-essentials",
      search: "",
      selected: new Set(),
    });

    expect(result).toHaveLength(1);
    expect(result[0].items.map((i) => i.key)).toEqual(["wifi", "heating"]);
  });

  it("shows only selected rows for the \"selected\" chip, across categories", () => {
    const result = filterAmenityGroups(groups, {
      chip: "selected",
      search: "",
      selected: new Set(["am-wifi", "am-smoke_detector"]),
    });

    expect(result.map((g) => g.category.key)).toEqual(["essentials", "safety"]);
    expect(result.flatMap((g) => g.items.map((i) => i.key))).toEqual([
      "wifi",
      "smoke_detector",
    ]);
  });

  it("matches the display label and the source name", () => {
    const byLabel = filterAmenityGroups(groups, {
      chip: "all",
      search: "wi-fi",
      selected: new Set(),
    });
    expect(byLabel.flatMap((g) => g.items.map((i) => i.key))).toEqual(["wifi"]);

    const bySourceName = filterAmenityGroups(groups, {
      chip: "all",
      search: "smoke",
      selected: new Set(),
    });
    expect(bySourceName.flatMap((g) => g.items.map((i) => i.key))).toEqual([
      "smoke_detector",
    ]);
  });

  it("matches a category label and keeps every row in that category", () => {
    const result = filterAmenityGroups(groups, {
      chip: "all",
      search: "kitchen",
      selected: new Set(),
    });

    expect(result.map((g) => g.category.key)).toEqual(["kitchen"]);
    expect(result[0].items.map((i) => i.key)).toEqual(["kitchen"]);
  });

  it("never returns an empty category", () => {
    const result = filterAmenityGroups(groups, {
      chip: "all",
      search: "nothing-matches-this",
      selected: new Set(),
    });

    expect(result).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import amenityCatalog from "../../../../prisma/data/amenity-catalog.json";
import {
  resolveAmenityCategory,
  resolveAmenityLabel,
} from "../amenity-labels";

const catalogResolver = {
  resolve: (key: string, source: string) => ({
    text: key,
    translated: key !== source,
  }),
};

describe("reviewed amenity translation coverage", () => {
  it("covers every amenity in the release catalog", () => {
    for (const amenity of amenityCatalog.amenities) {
      const resolved = resolveAmenityLabel(catalogResolver, amenity.name);
      expect(resolved.translated, amenity.name).toBe(true);
      expect(resolved.text, amenity.name).toMatch(/^amenities\.items\./);
    }
  });

  it("covers every category in the release catalog", () => {
    for (const category of amenityCatalog.categories) {
      const resolved = resolveAmenityCategory(catalogResolver, category.name);
      expect(resolved.translated, category.name).toBe(true);
      expect(resolved.text, category.name).toMatch(/^amenities\.categories\./);
    }
  });

  it("points every amenity at a category the catalog defines", () => {
    const keys = new Set(amenityCatalog.categories.map((category) => category.key));
    for (const amenity of amenityCatalog.amenities) {
      expect(keys.has(amenity.category), `${amenity.name} -> ${amenity.category}`).toBe(
        true,
      );
    }
  });

  it("uses appliance context for Iron", () => {
    expect(resolveAmenityLabel(catalogResolver, "Iron").text).toBe(
      "amenities.items.clothes_iron",
    );
  });
});

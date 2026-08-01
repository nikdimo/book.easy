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
    const categories = new Set(
      amenityCatalog.amenities.map((amenity) => amenity.category),
    );
    for (const category of categories) {
      const resolved = resolveAmenityCategory(catalogResolver, category);
      expect(resolved.translated, category).toBe(true);
      expect(resolved.text, category).toMatch(/^amenities\.categories\./);
    }
  });

  it("uses appliance context for Iron", () => {
    expect(resolveAmenityLabel(catalogResolver, "Iron").text).toBe(
      "amenities.items.clothes_iron",
    );
  });
});

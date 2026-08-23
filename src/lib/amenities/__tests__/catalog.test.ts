import { describe, expect, it } from "vitest";
import amenityCatalog from "../../../../prisma/data/amenity-catalog.json";
import { guessCategoryKey } from "../catalog";
import { isAmenityIconKey } from "../icon-registry";

describe("release catalog integrity", () => {
  it("gives every amenity an icon the registry can render", () => {
    for (const amenity of amenityCatalog.amenities) {
      expect(isAmenityIconKey(amenity.icon), `${amenity.name} -> ${amenity.icon}`).toBe(
        true,
      );
    }
  });

  it("gives every category an icon the registry can render", () => {
    for (const category of amenityCatalog.categories) {
      expect(isAmenityIconKey(category.icon), `${category.name}`).toBe(true);
    }
  });

  it("keeps amenity keys and names unique", () => {
    const keys = amenityCatalog.amenities.map((amenity) => amenity.key);
    const names = amenityCatalog.amenities.map((amenity) => amenity.name);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("categorising an unmapped provider label", () => {
  // Each of these used to land in Features, which is what filled that group with
  // kitchenware, toiletries and door locks.
  it.each([
    ["Hair dryer", "bathroom"],
    ["Dryer", "essentials"],
    ["Freezer", "kitchen"],
    ["Dishes and silverware", "kitchen"],
    ["Cooking basics", "kitchen"],
    ["Wine glasses", "kitchen"],
    ["Hot water kettle", "kitchen"],
    ["Shampoo", "bathroom"],
    ["Hot water", "bathroom"],
    ["Bed linens", "bedroom"],
    ["Room-darkening shades", "bedroom"],
    ["Clothing storage", "bedroom"],
    ["Lock on bedroom door", "safety"],
    ["Smart lock", "check_in"],
    ["Self check-in", "check_in"],
    ["Lockbox", "check_in"],
    ["Carbon monoxide alarm", "safety"],
    ["Smoke alarm", "safety"],
    ["Exterior security cameras on property", "safety"],
    ["Free parking on premises", "parking"],
    ["EV charger", "parking"],
    ["Elevator", "accessibility"],
    ["Pets allowed", "family"],
    ["Crib", "family"],
    ["Lake view", "views"],
    ["Waterfront", "views"],
    ["Pool", "outdoor"],
    ["Books and reading material", "entertainment"],
    ["Long-term stays allowed", "services"],
    ["Recycling", "services"],
    ["Private entrance", "check_in"],
    ["Changing table - available upon request", "family"],
    ["Outlet covers", "family"],
    ["Table corner guards", "family"],
    ["Drying rack for clothing", "essentials"],
    ["Laundromat nearby", "essentials"],
    ["Wi-Fi", "essentials"],
  ])("routes %s to %s", (label, expected) => {
    expect(guessCategoryKey(label)).toBe(expected);
  });

  it("falls back to Features for something it has never seen", () => {
    expect(guessCategoryKey("Zorbing ramp")).toBe("features");
  });
});

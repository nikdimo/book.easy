import { describe, expect, it } from "vitest";
import amenityCatalog from "../../../../prisma/data/amenity-catalog.json";
import { isAmenityIconKey } from "../icon-registry";
import {
  amenityDisplayIconKey,
  amenityDisplayLabel,
  amenityCategoryOverrideKey,
  shouldDisplayAmenity,
  type AmenityPresentationInput,
} from "../presentation";

const categoryIcons = new Map(
  amenityCatalog.categories.map((category) => [category.key, category.icon]),
);

function input({
  key,
  name,
  icon = null,
  categoryIcon = "sparkles",
  translated = false,
  label = name,
}: {
  key: string;
  name: string;
  icon?: string | null;
  categoryIcon?: string | null;
  translated?: boolean;
  label?: string;
}): AmenityPresentationInput {
  return { key, name, label, translated, icon, category: { icon: categoryIcon } };
}

describe("amenity presentation", () => {
  it("keeps every release amenity concise and renderable", () => {
    for (const amenity of amenityCatalog.amenities) {
      const value = input({
        ...amenity,
        categoryIcon: categoryIcons.get(amenity.category) ?? null,
      });
      expect(amenityDisplayLabel(value).length, amenity.name).toBeLessThanOrEqual(32);
      expect(isAmenityIconKey(amenityDisplayIconKey(value)), amenity.name).toBe(true);
    }
  });

  it.each([
    ["central_air_conditioning", "Central air conditioning", "Central A/C", "air-vent"],
    ["cleaning_products", "Cleaning products", "Cleaning products", "spray-can"],
    ["essentials", "Essentials", "Everyday essentials", "package"],
    ["fast_wifi_102_mbps", "Fast wifi – 102 Mbps", "High-speed Wi-Fi", "signal"],
    ["free_dryer_in_unit", "Free dryer – In unit", "In-unit dryer", "wind"],
    ["free_washer_in_unit", "Free washer – In unit", "In-unit washer", "washing-machine"],
    ["heating_split_type_ductless_system", "Heating - split type ductless system", "Split-system heating", "heater"],
    ["pocket_wifi", "Pocket wifi", "Portable Wi-Fi", "router"],
    ["roots_savil_a_e_shampoo", "Roots - Savil A.E shampoo", "Shampoo", "droplet"],
    ["roots_savil_a_e_body_soap", "Roots - Savil A.E.. body soap", "Body soap", "spray-can"],
    ["shower_gel", "Shower gel", "Shower gel", "droplets"],
    ["skip_ultimate_3in1_3_capsules_conditioner", "Skip Ultimate 3in1 3 Capsules conditioner", "Conditioner", "droplet"],
    ["bed_linens", "Bed linens", "Bed linens", "bed"],
    ["clothing_storage_closet_wardrobe_and_dresser", "Clothing storage: closet, wardrobe, and dresser", "Wardrobe & dresser", "archive"],
    ["extra_pillows_and_blankets", "Extra pillows and blankets", "Extra pillows & blankets", "bed"],
    ["hangers", "Hangers", "Hangers", "shirt"],
    ["room_darkening_shades", "Room-darkening shades", "Blackout shades", "blinds"],
    ["aeg_refrigerator", "AEG refrigerator", "Refrigerator", "refrigerator"],
    ["aeg_stainless_steel_double_oven", "AEG stainless steel double oven", "Double oven", "flame"],
    ["baking_sheet", "Baking sheet", "Baking sheet", "cooking-pot"],
    ["coffee_maker_nespresso", "Coffee maker: Nespresso", "Nespresso machine", "coffee"],
    ["samsung_stainless_steel_induction_stove", "Samsung stainless steel induction stove", "Induction stove", "cooking-pot"],
    ["paid_parking_garage_off_premises", "Paid parking garage off premises", "Paid parking garage", "parking-meter"],
    ["baby_bath_available_upon_request", "Baby bath - available upon request", "Baby bath · on request", "bath"],
    ["paid_crib_available_upon_request", "Paid crib - available upon request", "Crib · paid, on request", "bed-single"],
    ["paid_folding_or_convertible_high_chair_available_upon_request", "Paid folding or convertible high chair - available upon request", "High chair · paid, on request", "baby"],
    ["paid_pack_n_play_travel_crib_available_upon_request", "Paid pack ’n play/travel crib - available upon request", "Travel crib · paid, on request", "bed-single"],
    ["43_inch_hdtv_with_standard_cable", "43 inch HDTV with standard cable", "Cable TV", "tv"],
    ["changing_table_available_upon_request", "Changing table - available upon request", "Changing table · on request", "baby"],
    ["drying_rack_for_clothing", "Drying rack for clothing", "Drying rack", "shirt"],
    ["laundromat_nearby", "Laundromat nearby", "Nearby laundromat", "washing-machine"],
    ["outlet_covers", "Outlet covers", "Outlet covers", "plug-zap"],
    ["private_entrance", "Private entrance", "Private entrance", "door-open"],
    ["recycling", "Recycling", "Recycling", "recycle"],
    ["table_corner_guards", "Table corner guards", "Corner guards", "shield-check"],
  ])("presents imported %s clearly", (key, name, label, icon) => {
    const value = input({ key, name });
    expect(amenityDisplayLabel(value)).toBe(label);
    expect(amenityDisplayIconKey(value)).toBe(icon);
  });

  it("does not replace an admin-provided translated label with English", () => {
    const value = input({
      key: "books_reading_material",
      name: "Books and reading material",
      label: "Книги и материјали за читање",
      translated: true,
    });
    expect(amenityDisplayLabel(value)).toBe("Книги и материјали за читање");
  });

  it("hides unselected provider duplicates but preserves selected legacy data", () => {
    const keys = new Set(["wifi", "fast_wifi_102_mbps", "television"]);
    expect(shouldDisplayAmenity("fast_wifi_102_mbps", keys, false)).toBe(false);
    expect(shouldDisplayAmenity("fast_wifi_102_mbps", keys, true)).toBe(true);
    expect(shouldDisplayAmenity("pocket_wifi", keys, false)).toBe(true);
    expect(shouldDisplayAmenity("essentials", keys, false)).toBe(false);
  });

  it.each([
    ["changing_table_available_upon_request", "family"],
    ["outlet_covers", "family"],
    ["table_corner_guards", "family"],
    ["drying_rack_for_clothing", "essentials"],
    ["laundromat_nearby", "essentials"],
    ["private_entrance", "check_in"],
    ["recycling", "services"],
  ])("moves %s out of Features", (key, category) => {
    expect(amenityCategoryOverrideKey(key)).toBe(category);
  });
});

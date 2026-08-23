import { isAmenityIconKey } from "@/lib/amenities/icon-registry";
import { AMENITY_DUPLICATE_TARGETS } from "@/lib/amenities/dedupe-map";

export interface AmenityPresentationInput {
  key: string;
  name: string;
  label: string;
  translated: boolean;
  icon: string | null;
  category: { icon: string | null };
}

/**
 * Compact English labels for catalog entries whose source name carries provider detail
 * that is useful during import but noisy in a picker. Translated labels remain untouched.
 */
const SHORT_LABELS: Record<string, string> = {
  books_reading_material: "Books",
  books_and_reading_material: "Books",
  childrens_books_toys: "Kids’ books & toys",
  cleaning_during_stay: "Cleaning service",
  exterior_security_cameras: "Exterior cameras",
  exterior_security_cameras_on_property: "Exterior cameras",
  extra_pillows_blankets: "Extra pillows & blankets",
  extra_pillows_and_blankets: "Extra pillows & blankets",
  long_term_stays: "Long stays",
  luggage_dropoff: "Luggage drop-off",
  room_darkening_shades: "Blackout shades",
  towels_toiletries: "Towels & toiletries",
  waterfront_access: "Waterfront access",

  central_air_conditioning: "Central A/C",
  fast_wifi_102_mbps: "High-speed Wi-Fi",
  free_dryer_in_unit: "In-unit dryer",
  free_washer_in_unit: "In-unit washer",
  heating_split_type_ductless_system: "Split-system heating",
  pocket_wifi: "Portable Wi-Fi",
  essentials: "Everyday essentials",
  roots_savil_a_e_shampoo: "Shampoo",
  roots_savil_a_e_body_soap: "Body soap",
  skip_ultimate_3in1_3_capsules_conditioner: "Conditioner",
  clothing_storage_closet_wardrobe_and_dresser: "Wardrobe & dresser",
  aeg_refrigerator: "Refrigerator",
  aeg_stainless_steel_double_oven: "Double oven",
  coffee_maker_nespresso: "Nespresso machine",
  coffee: "Coffee provided",
  samsung_stainless_steel_induction_stove: "Induction stove",
  paid_parking_garage_off_premises: "Paid parking garage",
  baby_bath_available_upon_request: "Baby bath · on request",
  paid_crib_available_upon_request: "Crib · paid, on request",
  paid_folding_or_convertible_high_chair_available_upon_request:
    "High chair · paid, on request",
  paid_pack_n_play_travel_crib_available_upon_request:
    "Travel crib · paid, on request",
  "43_inch_hdtv_with_standard_cable": "Cable TV",
  changing_table_available_upon_request: "Changing table · on request",
  drying_rack_for_clothing: "Drying rack",
  laundromat_nearby: "Nearby laundromat",
  table_corner_guards: "Corner guards",
};

/** Imported variants that add brand/model detail but represent an existing marketplace
 * amenity. They stay visible when selected so a host can review and remove legacy data;
 * otherwise the canonical card is the only choice shown. */
const NOISE_KEYS = new Set(["essentials"]);

/** Stable corrections for provider rows that initially landed in the Features catch-all. */
const CATEGORY_OVERRIDES: Record<string, string> = {
  changing_table_available_upon_request: "family",
  outlet_covers: "family",
  table_corner_guards: "family",
  drying_rack_for_clothing: "essentials",
  laundromat_nearby: "essentials",
  private_entrance: "check_in",
  recycling: "services",
};

/** Provider-only rows do not pass through the reviewed release catalog, so their icon
 *  is resolved here from their stable imported key. */
const PROVIDER_ICON_OVERRIDES: Record<string, string> = {
  essentials: "package",
  baking_sheet: "cooking-pot",
  central_air_conditioning: "air-vent",
  fast_wifi_102_mbps: "signal",
  free_dryer_in_unit: "wind",
  free_washer_in_unit: "washing-machine",
  heating_split_type_ductless_system: "heater",
  pocket_wifi: "router",
  roots_savil_a_e_shampoo: "droplet",
  roots_savil_a_e_body_soap: "spray-can",
  shower_gel: "droplets",
  skip_ultimate_3in1_3_capsules_conditioner: "droplet",
  clothing_storage_closet_wardrobe_and_dresser: "archive",
  aeg_refrigerator: "refrigerator",
  aeg_stainless_steel_double_oven: "flame",
  coffee: "coffee",
  coffee_maker_nespresso: "coffee",
  samsung_stainless_steel_induction_stove: "cooking-pot",
  paid_parking_garage_off_premises: "parking-meter",
  baby_bath_available_upon_request: "bath",
  paid_crib_available_upon_request: "bed-single",
  paid_folding_or_convertible_high_chair_available_upon_request: "baby",
  paid_pack_n_play_travel_crib_available_upon_request: "bed-single",
  "43_inch_hdtv_with_standard_cable": "tv",
  changing_table_available_upon_request: "baby",
  drying_rack_for_clothing: "shirt",
  laundromat_nearby: "washing-machine",
  outlet_covers: "plug-zap",
  private_entrance: "door-open",
  recycling: "recycle",
  table_corner_guards: "shield-check",
};

const ICON_RULES: [RegExp, string][] = [
  [/^essentials$/i, "package"],
  [/\b(wi[- ]?fi|internet)\b/i, "wifi"],
  [/\b(air conditioning|a\/c)\b/i, "air-vent"],
  [/\b(heating|heater)\b/i, "heater"],
  [/\b(washer|washing machine|laundromat)\b/i, "washing-machine"],
  [/\b(dryer|drying rack|hair dryer)\b/i, "wind"],
  [/\b(cleaning products|cleaning supplies)\b/i, "spray-can"],
  [/\b(shampoo|conditioner|soap|shower gel)\b/i, "droplet"],
  [/\b(hot water)\b/i, "droplets"],
  [/\b(fridge|refrigerator)\b/i, "refrigerator"],
  [/\b(freezer)\b/i, "snowflake"],
  [/\b(oven|fire pit)\b/i, "flame"],
  [/\b(stove|cooking)\b/i, "cooking-pot"],
  [/\b(coffee|kettle)\b/i, "coffee"],
  [/\b(dishes|silverware|cutlery)\b/i, "utensils"],
  [/\b(wine glasses)\b/i, "wine"],
  [/\b(linens|pillows|blankets|crib)\b/i, "bed"],
  [/\b(wardrobe|dresser|closet|storage)\b/i, "archive"],
  [/\b(hangers)\b/i, "shirt"],
  [/\b(shades|blinds|curtains)\b/i, "blinds"],
  [/\b(tv|television|hdtv)\b/i, "tv"],
  [/\b(book|reading)\b/i, "book-open"],
  [/\b(parking|garage)\b/i, "circle-parking"],
  [/\b(camera|cctv)\b/i, "cctv"],
  [/\b(lockbox|keypad|self check)\b/i, "key-round"],
  [/\b(baby|changing table|high chair)\b/i, "baby"],
  [/\b(private entrance)\b/i, "door-open"],
  [/\b(recycl)\b/i, "recycle"],
];

export function amenityDisplayLabel(amenity: AmenityPresentationInput): string {
  if (amenity.translated) return amenity.label;
  return SHORT_LABELS[amenity.key] ?? amenity.label;
}

export function shouldDisplayAmenity(
  key: string,
  availableKeys: ReadonlySet<string>,
  selected: boolean,
): boolean {
  if (selected) return true;
  if (NOISE_KEYS.has(key)) return false;
  const canonicalKey = AMENITY_DUPLICATE_TARGETS[key as keyof typeof AMENITY_DUPLICATE_TARGETS];
  return canonicalKey === undefined || !availableKeys.has(canonicalKey);
}

export function amenityCategoryOverrideKey(key: string): string | null {
  return CATEGORY_OVERRIDES[key] ?? null;
}

/** Returns a renderable icon key for every amenity, preferring curated provider rules
 *  over stale/null database values and using the category only as the last fallback. */
export function amenityDisplayIconKey(
  amenity: AmenityPresentationInput,
): string {
  const ruleIcon = ICON_RULES.find(([pattern]) => pattern.test(amenity.name))?.[1];
  const candidates = [
    PROVIDER_ICON_OVERRIDES[amenity.key],
    ruleIcon,
    amenity.icon,
    amenity.category.icon,
    "sparkles",
  ];
  return candidates.find(isAmenityIconKey) ?? "sparkles";
}

/**
 * Provider-specific catalog rows that represent an existing canonical amenity.
 *
 * Keep this server-safe: the one-time database reconciliation and the amenity picker
 * both consume the same map so display cleanup cannot drift from persisted data.
 */
export const AMENITY_DUPLICATE_TARGETS = {
  central_air_conditioning: "air_conditioning",
  fast_wifi_102_mbps: "wifi",
  free_dryer_in_unit: "clothes_dryer",
  free_washer_in_unit: "washing_machine",
  heating_split_type_ductless_system: "heating",
  roots_savil_a_e_shampoo: "shampoo",
  clothing_storage_closet_wardrobe_and_dresser: "clothing_storage",
  aeg_refrigerator: "refrigerator",
  aeg_stainless_steel_double_oven: "oven",
  coffee_maker_nespresso: "coffee_maker",
  samsung_stainless_steel_induction_stove: "stove",
  paid_crib_available_upon_request: "crib",
  paid_folding_or_convertible_high_chair_available_upon_request: "high_chair",
  paid_pack_n_play_travel_crib_available_upon_request: "crib",
  "43_inch_hdtv_with_standard_cable": "television",
} as const satisfies Record<string, string>;

export function canonicalAmenityKey(key: string): string {
  return AMENITY_DUPLICATE_TARGETS[key as keyof typeof AMENITY_DUPLICATE_TARGETS] ?? key;
}

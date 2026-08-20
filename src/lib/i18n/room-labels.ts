import type { Resolved } from "@/lib/i18n/t";

interface TranslationResolver {
  resolve(key: string, source: string): Resolved;
}

/**
 * Room and space types are admin-controlled marketplace taxonomy, not host-authored
 * copy. The calls stay explicit so the AST extractor places every label in the reviewed
 * UI catalog — the same arrangement `amenity-labels.ts` has, for the same reason.
 *
 * This is the fallback layer: an admin's per-language override in RoomTypeTranslation
 * wins over it, and a name with no case here resolves to its English label.
 */
export function resolveRoomTypeLabel(
  translator: TranslationResolver,
  name: string,
): Resolved {
  switch (name) {
    case "Balcony":
      return translator.resolve("rooms.types.balcony", "Balcony");
    case "Bathroom":
      return translator.resolve("rooms.types.bathroom", "Bathroom");
    case "Bedroom":
      return translator.resolve("rooms.types.bedroom", "Bedroom");
    case "Dining area":
      return translator.resolve("rooms.types.dining_area", "Dining area");
    case "Driveway":
      return translator.resolve("rooms.types.driveway", "Driveway");
    case "Entrance":
      return translator.resolve("rooms.types.entrance", "Entrance");
    case "Exterior":
      return translator.resolve("rooms.types.exterior", "Exterior");
    case "Games room":
      return translator.resolve("rooms.types.games_room", "Games room");
    case "Garage":
      return translator.resolve("rooms.types.garage", "Garage");
    case "Garden":
      return translator.resolve("rooms.types.garden", "Garden");
    case "Gym":
      return translator.resolve("rooms.types.gym", "Gym");
    case "Hallway":
      return translator.resolve("rooms.types.hallway", "Hallway");
    case "Hot tub":
      return translator.resolve("rooms.types.hot_tub", "Hot tub");
    case "Kitchen":
      return translator.resolve("rooms.types.kitchen", "Kitchen");
    case "Laundry room":
      return translator.resolve("rooms.types.laundry_room", "Laundry room");
    case "Living room":
      return translator.resolve("rooms.types.living_room", "Living room");
    case "Other":
      return translator.resolve("rooms.types.other", "Other");
    case "Outdoor dining area":
      return translator.resolve("rooms.types.outdoor_dining_area", "Outdoor dining area");
    case "Outdoor kitchen":
      return translator.resolve("rooms.types.outdoor_kitchen", "Outdoor kitchen");
    case "Parking":
      return translator.resolve("rooms.types.parking", "Parking");
    case "Patio":
      return translator.resolve("rooms.types.patio", "Patio");
    case "Playroom":
      return translator.resolve("rooms.types.playroom", "Playroom");
    case "Pool":
      return translator.resolve("rooms.types.pool", "Pool");
    case "Sauna":
      return translator.resolve("rooms.types.sauna", "Sauna");
    case "Terrace":
      return translator.resolve("rooms.types.terrace", "Terrace");
    case "Toilet":
      return translator.resolve("rooms.types.toilet", "Toilet");
    case "View":
      return translator.resolve("rooms.types.view", "View");
    case "Waterfront":
      return translator.resolve("rooms.types.waterfront", "Waterfront");
    case "Workspace":
      return translator.resolve("rooms.types.workspace", "Workspace");
    case "Yard":
      return translator.resolve("rooms.types.yard", "Yard");
    default:
      return { text: name, translated: false };
  }
}

export function resolveRoomCategory(
  translator: TranslationResolver,
  name: string,
): Resolved {
  switch (name) {
    case "Additional spaces":
      return translator.resolve("rooms.categories.additional", "Additional spaces");
    case "Interior":
      return translator.resolve("rooms.categories.interior", "Interior");
    case "Outdoor":
      return translator.resolve("rooms.categories.outdoor", "Outdoor");
    default:
      return { text: name, translated: false };
  }
}

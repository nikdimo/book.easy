import type { Resolved } from "@/lib/i18n/t";

interface TranslationResolver {
  resolve(key: string, source: string): Resolved;
}

/**
 * Amenities are admin-controlled marketplace taxonomy, not host-authored copy.
 * Keep the calls explicit so the AST extractor places every label in the reviewed
 * UI catalog. Context-rich keys disambiguate short English labels such as "Iron".
 *
 * This is the fallback layer: an admin's per-language override in AmenityTranslation
 * wins over it, and a name with no case here resolves to its English label.
 */
export function resolveAmenityLabel(
  translator: TranslationResolver,
  name: string,
): Resolved {
  switch (name) {
    case "Air conditioning":
      return translator.resolve("amenities.items.air_conditioning", "Air conditioning");
    case "Baking sheet":
      return translator.resolve("amenities.items.baking_sheet", "Baking sheet");
    case "Balcony":
      return translator.resolve("amenities.items.balcony", "Balcony");
    case "BBQ grill":
      return translator.resolve("amenities.items.bbq_grill", "BBQ grill");
    case "Bed linens":
      return translator.resolve("amenities.items.bed_linens", "Bed linens");
    case "Bike storage":
      return translator.resolve("amenities.items.bike_storage", "Bike storage");
    case "Blender":
      return translator.resolve("amenities.items.blender", "Blender");
    case "Board games":
      return translator.resolve("amenities.items.board_games", "Board games");
    case "Books and reading material":
      return translator.resolve("amenities.items.books_reading_material", "Books and reading material");
    case "Breakfast":
      return translator.resolve("amenities.items.breakfast", "Breakfast");
    case "Carbon monoxide alarm":
      return translator.resolve("amenities.items.carbon_monoxide_alarm", "Carbon monoxide alarm");
    case "Children's books and toys":
      return translator.resolve("amenities.items.childrens_books_toys", "Children's books and toys");
    case "City view":
      return translator.resolve("amenities.items.city_view", "City view");
    case "Cleaning available during stay":
      return translator.resolve("amenities.items.cleaning_during_stay", "Cleaning available during stay");
    case "Cleaning products":
      return translator.resolve("amenities.items.cleaning_products", "Cleaning products");
    case "Clothing storage":
      return translator.resolve("amenities.items.clothing_storage", "Clothing storage");
    case "Coffee maker":
      return translator.resolve("amenities.items.coffee_maker", "Coffee maker");
    case "Cooking basics":
      return translator.resolve("amenities.items.cooking_basics", "Cooking basics");
    case "Crib":
      return translator.resolve("amenities.items.crib", "Crib");
    case "Dining table":
      return translator.resolve("amenities.items.dining_table", "Dining table");
    case "Dishes and silverware":
      return translator.resolve("amenities.items.dishes_silverware", "Dishes and silverware");
    case "Dishwasher":
      return translator.resolve("amenities.items.dishwasher", "Dishwasher");
    case "Dryer":
      return translator.resolve("amenities.items.clothes_dryer", "Dryer");
    case "Elevator":
      return translator.resolve("amenities.items.elevator", "Elevator");
    case "EV charger":
      return translator.resolve("amenities.items.ev_charger", "EV charger");
    case "Exterior security cameras on property":
      return translator.resolve("amenities.items.exterior_security_cameras", "Exterior security cameras on property");
    case "Extra pillows and blankets":
      return translator.resolve("amenities.items.extra_pillows_blankets", "Extra pillows and blankets");
    case "Fire extinguisher":
      return translator.resolve("amenities.items.fire_extinguisher", "Fire extinguisher");
    case "Fire pit":
      return translator.resolve("amenities.items.fire_pit", "Fire pit");
    case "First aid kit":
      return translator.resolve("amenities.items.first_aid_kit", "First aid kit");
    case "Free parking":
      return translator.resolve("amenities.items.free_parking", "Free parking");
    case "Free street parking":
      return translator.resolve("amenities.items.free_street_parking", "Free street parking");
    case "Freezer":
      return translator.resolve("amenities.items.freezer", "Freezer");
    case "Garden":
      return translator.resolve("amenities.items.garden", "Garden");
    case "Ground floor":
      return translator.resolve("amenities.items.ground_floor", "Ground floor");
    case "Hair dryer":
      return translator.resolve("amenities.items.hair_dryer", "Hair dryer");
    case "Hangers":
      return translator.resolve("amenities.items.hangers", "Hangers");
    case "Heating":
      return translator.resolve("amenities.items.heating", "Heating");
    case "High chair":
      return translator.resolve("amenities.items.high_chair", "High chair");
    case "Host greets you":
      return translator.resolve("amenities.items.host_greets_you", "Host greets you");
    case "Hot tub":
      return translator.resolve("amenities.items.hot_tub", "Hot tub");
    case "Hot water":
      return translator.resolve("amenities.items.hot_water", "Hot water");
    case "Hot water kettle":
      return translator.resolve("amenities.items.hot_water_kettle", "Hot water kettle");
    case "Iron":
      return translator.resolve("amenities.items.clothes_iron", "Iron");
    case "Kitchen":
      return translator.resolve("amenities.items.kitchen", "Kitchen");
    case "Lake or sea access":
      return translator.resolve("amenities.items.waterfront_access", "Lake or sea access");
    case "Lake view":
      return translator.resolve("amenities.items.lake_view", "Lake view");
    case "Lock on bedroom door":
      return translator.resolve("amenities.items.lock_on_bedroom_door", "Lock on bedroom door");
    case "Lockbox":
      return translator.resolve("amenities.items.lockbox", "Lockbox");
    case "Long-term stays allowed":
      return translator.resolve("amenities.items.long_term_stays", "Long-term stays allowed");
    case "Luggage drop-off allowed":
      return translator.resolve("amenities.items.luggage_dropoff", "Luggage drop-off allowed");
    case "Microwave":
      return translator.resolve("amenities.items.microwave", "Microwave");
    case "Mountain view":
      return translator.resolve("amenities.items.mountain_view", "Mountain view");
    case "Outdoor furniture":
      return translator.resolve("amenities.items.outdoor_furniture", "Outdoor furniture");
    case "Oven":
      return translator.resolve("amenities.items.oven", "Oven");
    case "Paid parking":
      return translator.resolve("amenities.items.paid_parking", "Paid parking");
    case "Pets allowed":
      return translator.resolve("amenities.items.pets_allowed", "Pets allowed");
    case "Pool":
      return translator.resolve("amenities.items.swimming_pool", "Pool");
    case "Refrigerator":
      return translator.resolve("amenities.items.refrigerator", "Refrigerator");
    case "Room-darkening shades":
      return translator.resolve("amenities.items.room_darkening_shades", "Room-darkening shades");
    case "Sauna":
      return translator.resolve("amenities.items.sauna", "Sauna");
    case "Sea view":
      return translator.resolve("amenities.items.sea_view", "Sea view");
    case "Self check-in":
      return translator.resolve("amenities.items.self_check_in", "Self check-in");
    case "Shampoo":
      return translator.resolve("amenities.items.shampoo", "Shampoo");
    case "Smart lock":
      return translator.resolve("amenities.items.smart_lock", "Smart lock");
    case "Smoke detector":
      return translator.resolve("amenities.items.smoke_detector", "Smoke detector");
    case "Sound system":
      return translator.resolve("amenities.items.sound_system", "Sound system");
    case "Step-free entrance":
      return translator.resolve("amenities.items.step_free_entrance", "Step-free entrance");
    case "Stove":
      return translator.resolve("amenities.items.stove", "Stove");
    case "Terrace":
      return translator.resolve("amenities.items.terrace", "Terrace");
    case "Toaster":
      return translator.resolve("amenities.items.toaster", "Toaster");
    case "Towels and toiletries":
      return translator.resolve("amenities.items.towels_toiletries", "Towels and toiletries");
    case "TV":
      return translator.resolve("amenities.items.television", "TV");
    case "Washer":
      return translator.resolve("amenities.items.washing_machine", "Washer");
    case "Wi-Fi":
      return translator.resolve("amenities.items.wifi", "Wi-Fi");
    case "Wine glasses":
      return translator.resolve("amenities.items.wine_glasses", "Wine glasses");
    case "Workspace":
      return translator.resolve("amenities.items.workspace", "Workspace");
    default:
      return { text: name, translated: false };
  }
}

export function resolveAmenityCategory(
  translator: TranslationResolver,
  category: string,
): Resolved {
  switch (category) {
    case "Accessibility":
      return translator.resolve("amenities.categories.accessibility", "Accessibility");
    case "Bathroom":
      return translator.resolve("amenities.categories.bathroom", "Bathroom");
    case "Bedroom":
      return translator.resolve("amenities.categories.bedroom", "Bedroom");
    case "Check-in":
      return translator.resolve("amenities.categories.check_in", "Check-in");
    case "Entertainment":
      return translator.resolve("amenities.categories.entertainment", "Entertainment");
    case "Essentials":
      return translator.resolve("amenities.categories.essentials", "Essentials");
    case "Family":
      return translator.resolve("amenities.categories.family", "Family");
    case "Features":
      return translator.resolve("amenities.categories.features", "Features");
    case "Kitchen":
      return translator.resolve("amenities.categories.kitchen", "Kitchen");
    case "Outdoor":
      return translator.resolve("amenities.categories.outdoor", "Outdoor");
    case "Parking":
      return translator.resolve("amenities.categories.parking", "Parking");
    case "Safety":
      return translator.resolve("amenities.categories.safety", "Safety");
    case "Services":
      return translator.resolve("amenities.categories.services", "Services");
    case "Views":
      return translator.resolve("amenities.categories.views", "Views");
    default:
      return { text: category, translated: false };
  }
}

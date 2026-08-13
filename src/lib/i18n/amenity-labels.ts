import type { Resolved } from "@/lib/i18n/t";

interface TranslationResolver {
  resolve(key: string, source: string): Resolved;
}

/**
 * Amenities are admin-controlled marketplace taxonomy, not host-authored copy.
 * Keep the calls explicit so the AST extractor places every label in the reviewed
 * UI catalog. Context-rich keys disambiguate short English labels such as "Iron".
 */
export function resolveAmenityLabel(
  translator: TranslationResolver,
  name: string,
): Resolved {
  switch (name) {
    case "Baking sheet":
      return translator.resolve("amenities.items.baking_sheet", "Baking sheet");
    case "Blender":
      return translator.resolve("amenities.items.blender", "Blender");
    case "Books and reading material":
      return translator.resolve("amenities.items.books_reading_material", "Books and reading material");
    case "Cleaning products":
      return translator.resolve("amenities.items.cleaning_products", "Cleaning products");
    case "Clothing storage":
      return translator.resolve("amenities.items.clothing_storage", "Clothing storage");
    case "Cooking basics":
      return translator.resolve("amenities.items.cooking_basics", "Cooking basics");
    case "Dishes and silverware":
      return translator.resolve("amenities.items.dishes_silverware", "Dishes and silverware");
    case "Extra pillows and blankets":
      return translator.resolve("amenities.items.extra_pillows_blankets", "Extra pillows and blankets");
    case "Freezer":
      return translator.resolve("amenities.items.freezer", "Freezer");
    case "Hangers":
      return translator.resolve("amenities.items.hangers", "Hangers");
    case "Hot water":
      return translator.resolve("amenities.items.hot_water", "Hot water");
    case "Hot water kettle":
      return translator.resolve("amenities.items.hot_water_kettle", "Hot water kettle");
    case "Hair dryer":
      return translator.resolve("amenities.items.hair_dryer", "Hair dryer");
    case "TV":
      return translator.resolve("amenities.items.television", "TV");
    case "Air conditioning":
      return translator.resolve("amenities.items.air_conditioning", "Air conditioning");
    case "Dryer":
      return translator.resolve("amenities.items.clothes_dryer", "Dryer");
    case "Heating":
      return translator.resolve("amenities.items.heating", "Heating");
    case "Iron":
      return translator.resolve("amenities.items.clothes_iron", "Iron");
    case "Washer":
      return translator.resolve("amenities.items.washing_machine", "Washer");
    case "Wi-Fi":
      return translator.resolve("amenities.items.wifi", "Wi-Fi");
    case "City view":
      return translator.resolve("amenities.items.city_view", "City view");
    case "Free parking":
      return translator.resolve("amenities.items.free_parking", "Free parking");
    case "Hot tub":
      return translator.resolve("amenities.items.hot_tub", "Hot tub");
    case "Lake view":
      return translator.resolve("amenities.items.lake_view", "Lake view");
    case "Pool":
      return translator.resolve("amenities.items.swimming_pool", "Pool");
    case "Sea view":
      return translator.resolve("amenities.items.sea_view", "Sea view");
    case "Workspace":
      return translator.resolve("amenities.items.workspace", "Workspace");
    case "Coffee maker":
      return translator.resolve("amenities.items.coffee_maker", "Coffee maker");
    case "Dishwasher":
      return translator.resolve("amenities.items.dishwasher", "Dishwasher");
    case "Kitchen":
      return translator.resolve("amenities.items.kitchen", "Kitchen");
    case "Microwave":
      return translator.resolve("amenities.items.microwave", "Microwave");
    case "Refrigerator":
      return translator.resolve("amenities.items.refrigerator", "Refrigerator");
    case "Balcony":
      return translator.resolve("amenities.items.balcony", "Balcony");
    case "BBQ grill":
      return translator.resolve("amenities.items.bbq_grill", "BBQ grill");
    case "Garden":
      return translator.resolve("amenities.items.garden", "Garden");
    case "Fire extinguisher":
      return translator.resolve("amenities.items.fire_extinguisher", "Fire extinguisher");
    case "First aid kit":
      return translator.resolve("amenities.items.first_aid_kit", "First aid kit");
    case "Smoke detector":
      return translator.resolve("amenities.items.smoke_detector", "Smoke detector");
    default:
      return { text: name, translated: false };
  }
}

export function resolveAmenityCategory(
  translator: TranslationResolver,
  category: string,
): Resolved {
  switch (category) {
    case "Bathroom":
      return translator.resolve("amenities.categories.bathroom", "Bathroom");
    case "Entertainment":
      return translator.resolve("amenities.categories.entertainment", "Entertainment");
    case "Essentials":
      return translator.resolve("amenities.categories.essentials", "Essentials");
    case "Features":
      return translator.resolve("amenities.categories.features", "Features");
    case "Kitchen":
      return translator.resolve("amenities.categories.kitchen", "Kitchen");
    case "Outdoor":
      return translator.resolve("amenities.categories.outdoor", "Outdoor");
    case "Safety":
      return translator.resolve("amenities.categories.safety", "Safety");
    default:
      return { text: category, translated: false };
  }
}

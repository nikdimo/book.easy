import type { Resolved } from "@/lib/i18n/t";

interface TranslationResolver {
  resolve(key: string, source: string): Resolved;
}

/**
 * Property types are an admin-managed catalog (see lib/services/property-type.service.ts),
 * so their labels arrive from the database as English strings with no translation key
 * attached. Rendering them raw is what put "Apartment / House / Villa" inside an
 * otherwise Macedonian listing wizard.
 *
 * Same shape as resolveAmenityLabel: explicit literal calls so the AST extractor puts
 * every one in the reviewed UI catalog, keyed by the stable `value` code rather than
 * the label — an admin renaming "Cottage" in Settings shouldn't strand the translation.
 * A type this file doesn't know (a host suggestion approved into the catalog, or a
 * legacy code) falls through to the database text, which Google's live DOM translation
 * still picks up.
 */
export function resolvePropertyTypeLabel(
  translator: TranslationResolver,
  value: string,
  fallback: string,
): Resolved {
  switch (value) {
    case "APARTMENT":
      return translator.resolve("property_types.items.apartment", "Apartment");
    case "HOUSE":
      return translator.resolve("property_types.items.house", "House");
    case "ROW_HOUSE":
      return translator.resolve("property_types.items.row_house", "Row House");
    case "HOUSE_FLOOR":
      return translator.resolve("property_types.items.house_floor", "Floor of a House");
    case "VILLA":
      return translator.resolve("property_types.items.villa", "Villa");
    case "STUDIO":
      return translator.resolve("property_types.items.studio", "Studio");
    case "LOFT":
      return translator.resolve("property_types.items.loft", "Loft");
    case "CABIN":
      return translator.resolve("property_types.items.cabin", "Cabin");
    case "COTTAGE":
      return translator.resolve("property_types.items.cottage", "Cottage");
    case "HOTEL":
      return translator.resolve("property_types.items.hotel", "Hotel");
    case "OTHER":
      return translator.resolve("property_types.items.other", "Other");
    default:
      return { text: fallback, translated: false };
  }
}

/** The one-line explanation shown in the picker's tooltip. */
export function resolvePropertyTypeDescription(
  translator: TranslationResolver,
  value: string,
  fallback: string,
): Resolved {
  switch (value) {
    case "APARTMENT":
      return translator.resolve(
        "property_types.descriptions.apartment",
        "A private, self-contained home within a larger residential building.",
      );
    case "HOUSE":
      return translator.resolve(
        "property_types.descriptions.house",
        "An entire house that guests have to themselves, standing on its own.",
      );
    case "ROW_HOUSE":
      return translator.resolve(
        "property_types.descriptions.row_house",
        "A house joined to neighboring houses by one or both side walls.",
      );
    case "HOUSE_FLOOR":
      return translator.resolve(
        "property_types.descriptions.house_floor",
        "A private floor or level within a larger house.",
      );
    case "VILLA":
      return translator.resolve(
        "property_types.descriptions.villa",
        "A spacious standalone home, often with private outdoor space or premium amenities.",
      );
    case "STUDIO":
      return translator.resolve(
        "property_types.descriptions.studio",
        "A compact open-plan home where living and sleeping areas share one main room.",
      );
    case "LOFT":
      return translator.resolve(
        "property_types.descriptions.loft",
        "An open-plan space, often with high ceilings or converted industrial features.",
      );
    case "CABIN":
      return translator.resolve(
        "property_types.descriptions.cabin",
        "A small, usually rustic home in a natural or rural setting.",
      );
    case "COTTAGE":
      return translator.resolve(
        "property_types.descriptions.cottage",
        "A cozy traditional home, usually in the countryside or close to nature.",
      );
    case "HOTEL":
      return translator.resolve(
        "property_types.descriptions.hotel",
        "A hotel, guesthouse, or similar property where guests book individual rooms.",
      );
    case "OTHER":
      return translator.resolve(
        "property_types.descriptions.other",
        "Accommodation that does not fit one of the standard property categories.",
      );
    default:
      return { text: fallback, translated: false };
  }
}

export function resolveListingSpaceTypeLabel(
  translator: TranslationResolver,
  value: string,
): Resolved {
  switch (value) {
    case "PRIVATE_ROOM":
      return translator.resolve("host.space_type.private_room", "Private room");
    case "SHARED_ROOM":
      return translator.resolve("host.space_type.shared_room", "Shared room");
    case "HOTEL_ROOM":
      return translator.resolve("host.space_type.hotel_room", "Hotel room");
    default:
      return translator.resolve("host.space_type.entire_place", "Entire place");
  }
}

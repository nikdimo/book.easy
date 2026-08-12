export const LISTING_SPACE_TYPES = [
  {
    value: "ENTIRE_PLACE",
    label: "Entire place",
    description: "Guests have the whole property to themselves.",
  },
  {
    value: "PRIVATE_ROOM",
    label: "Private room",
    description: "Guests have a private room and may share other spaces.",
  },
  {
    value: "SHARED_ROOM",
    label: "Shared room",
    description: "Guests sleep in a room or area shared with others.",
  },
  {
    value: "HOTEL_ROOM",
    label: "Hotel room",
    description: "Guests book a private room in a hotel or similar property.",
  },
] as const;

export type ListingSpaceTypeValue = (typeof LISTING_SPACE_TYPES)[number]["value"];

export function normalizeListingSpaceType(value: unknown): ListingSpaceTypeValue {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase().replace(/[ -]+/g, "_");
    if (LISTING_SPACE_TYPES.some((option) => option.value === normalized)) {
      return normalized as ListingSpaceTypeValue;
    }
    if (normalized.includes("PRIVATE") && normalized.includes("ROOM")) return "PRIVATE_ROOM";
    if (normalized.includes("SHARED") && normalized.includes("ROOM")) return "SHARED_ROOM";
    if (normalized.includes("HOTEL") && normalized.includes("ROOM")) return "HOTEL_ROOM";
  }
  return "ENTIRE_PLACE";
}

export function listingSpaceTypeLabel(value: unknown): string {
  const normalized = normalizeListingSpaceType(value);
  return LISTING_SPACE_TYPES.find((option) => option.value === normalized)!.label;
}


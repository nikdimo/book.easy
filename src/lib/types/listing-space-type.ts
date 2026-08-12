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
export type ListingSpaceTypeOption = (typeof LISTING_SPACE_TYPES)[number];

/** The property type a listing needs before "Hotel room" is a coherent answer. */
const HOTEL_PROPERTY_TYPE = "HOTEL";

/** Which answers to "what will guests book?" make sense for a given property type.
 *  "Hotel room" only means something inside a hotel, and offering it against a cabin
 *  is how a picker starts reading as a list of unrelated words.
 *
 *  `current` is always kept in the list even when the rules would drop it: a listing
 *  published before these rules existed must not silently lose the answer it went
 *  live with, and a host who changes property type mid-edit should see the stale
 *  choice sitting there rather than have it vanish. */
export function allowedListingSpaceTypes(
  propertyType: string | undefined,
  current?: unknown,
): ListingSpaceTypeOption[] {
  if (propertyType === HOTEL_PROPERTY_TYPE) return [...LISTING_SPACE_TYPES];
  return LISTING_SPACE_TYPES.filter(
    (option) => option.value !== "HOTEL_ROOM" || option.value === current,
  );
}

/** The space type to carry forward after the host picks (or changes) `propertyType`.
 *  Picking Hotel answers this question by itself, and leaving "Hotel room" selected
 *  after switching to a cabin would publish a combination the picker no longer even
 *  offers. Every other current value is left exactly as the host set it. */
export function spaceTypeForPropertyType(
  propertyType: string | undefined,
  current: unknown,
): ListingSpaceTypeValue {
  if (propertyType === HOTEL_PROPERTY_TYPE) {
    return current === "HOTEL_ROOM" || current === "ENTIRE_PLACE"
      ? (current as ListingSpaceTypeValue)
      : "HOTEL_ROOM";
  }
  return current === "HOTEL_ROOM"
    ? "ENTIRE_PLACE"
    : normalizeListingSpaceType(current);
}

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


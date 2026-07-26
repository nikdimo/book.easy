export const LISTING_STEPS = [
  { title: "Property type", description: "What kind of place will guests book?" },
  { title: "Location", description: "Help guests understand where they will stay." },
  { title: "Property details", description: "Set the capacity and sleeping arrangements." },
  { title: "Amenities", description: "Choose what your property offers." },
  { title: "Photos", description: "Add at least 3 photos and choose the best one first." },
  { title: "Description", description: "Give guests a clear, inviting overview." },
  { title: "Pricing", description: "Set the price and minimum stay, then publish." },
] as const;

export function normalizeListingStep(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : 0;

  if (!Number.isInteger(parsed)) return 0;
  return Math.min(LISTING_STEPS.length - 1, Math.max(0, parsed));
}

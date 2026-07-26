export const PROPERTY_TYPE_ICONS = [
  { value: "Building2", label: "Apartment building" },
  { value: "House", label: "House" },
  { value: "Hotel", label: "Townhouse" },
  { value: "PanelsTopLeft", label: "Floor or unit" },
  { value: "Castle", label: "Villa" },
  { value: "Warehouse", label: "Studio or loft" },
  { value: "TreePine", label: "Cabin" },
  { value: "Tent", label: "Cottage or nature stay" },
  { value: "Landmark", label: "Historic building" },
  { value: "Store", label: "Shop conversion" },
  { value: "School", label: "Large residence" },
  { value: "Factory", label: "Industrial loft" },
  { value: "BedDouble", label: "Guest room" },
  { value: "CircleHelp", label: "Other" },
] as const;

export type PropertyTypeIconName = (typeof PROPERTY_TYPE_ICONS)[number]["value"];

export const DEFAULT_PROPERTY_TYPE_ICON: PropertyTypeIconName = "Building2";

export function isPropertyTypeIconName(value: string): value is PropertyTypeIconName {
  return PROPERTY_TYPE_ICONS.some((icon) => icon.value === value);
}

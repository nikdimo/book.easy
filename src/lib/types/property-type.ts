export interface PropertyTypeOption {
  value: string;
  label: string;
  icon: string;
  description: string;
}

/** Catalog codes that were merged away, mapped to what replaced them. Published
 *  listings are rewritten by the migration that does the merge, but a saved draft
 *  keeps its answers in JSON with no foreign key to follow — reopening one has to
 *  translate the old code here or the host lands on a picker with nothing selected
 *  and no idea why. */
const MERGED_PROPERTY_TYPES: Record<string, string> = {
  // Merged into HOUSE — "Row House" already covered the only difference.
  DETACHED_HOUSE: "HOUSE",
};

export function normalizePropertyType(value: string | undefined | null): string {
  if (!value) return "";
  return MERGED_PROPERTY_TYPES[value] ?? value;
}

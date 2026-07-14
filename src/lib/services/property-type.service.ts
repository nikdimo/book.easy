import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import type { PropertyTypeOption } from "@/lib/types/property-type";

export const PROPERTY_TYPES_TAG = "property-types";

/** Admin-managed catalog (formerly a hardcoded enum) — cached and invalidated via
 * PROPERTY_TYPES_TAG whenever a suggestion is approved/rejected (see
 * lib/actions/suggestion.actions.ts). */
export const getActivePropertyTypes = unstable_cache(
  async (): Promise<PropertyTypeOption[]> => {
    return db.propertyType.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { value: true, label: true },
    });
  },
  ["active-property-types"],
  { revalidate: 300, tags: [PROPERTY_TYPES_TAG] }
);

/** Full catalog including soft-hidden rows, for the admin Settings tab. */
export async function getAllPropertyTypesForAdmin() {
  return db.propertyType.findMany({
    orderBy: { sortOrder: "asc" },
  });
}

/** Label lookup that also covers inactive/listing-only types (e.g. a listing using a
 * type that was approved "this listing only" and never made it into the active list). */
export async function getPropertyTypeLabel(value: string): Promise<string> {
  const active = await getActivePropertyTypes();
  const found = active.find((t) => t.value === value);
  if (found) return found.label;

  const row = await db.propertyType.findUnique({
    where: { value },
    select: { label: true },
  });
  return row?.label ?? value;
}

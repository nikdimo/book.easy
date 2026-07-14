import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";

export const AMENITIES_TAG = "amenities";

/** Admin-managed catalog — cached and invalidated via AMENITIES_TAG whenever a
 * suggestion is approved or an admin adds/hides one from Settings. */
export const getActiveAmenities = unstable_cache(
  async () => {
    return db.amenity.findMany({
      where: { isActive: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
  },
  ["active-amenities"],
  { revalidate: 300, tags: [AMENITIES_TAG] }
);

/** Full catalog including soft-hidden rows, for the admin Settings tab. */
export async function getAllAmenitiesForAdmin() {
  return db.amenity.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

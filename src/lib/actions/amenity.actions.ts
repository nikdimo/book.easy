"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { revalidateTag, revalidatePath } from "next/cache";
import { AMENITIES_TAG } from "@/lib/services/amenity.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";

export async function addAmenity(name: string, category: string) {
  await requireAdmin();

  const label = name.trim();
  if (label.length < 2) {
    return { error: "Please enter a name for the amenity." };
  }

  const existing = await db.amenity.findUnique({ where: { name: label } });
  if (existing) {
    return { error: "An amenity with that name already exists." };
  }

  await db.amenity.create({ data: { name: label, category } });

  revalidateTag(AMENITIES_TAG, "max");
  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
  return { success: true };
}

export async function toggleAmenityActive(id: string) {
  await requireAdmin();

  const amenity = await db.amenity.findUnique({ where: { id } });
  if (!amenity) {
    return { error: "Amenity not found." };
  }

  await db.amenity.update({
    where: { id },
    data: { isActive: !amenity.isActive },
  });

  revalidateTag(AMENITIES_TAG, "max");
  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
  return { success: true };
}

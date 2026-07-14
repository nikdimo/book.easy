"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { revalidateTag, revalidatePath } from "next/cache";
import { PROPERTY_TYPES_TAG } from "@/lib/services/property-type.service";
import { uniquePropertyTypeValue } from "@/lib/utils/property-type";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";

export async function addPropertyType(label: string) {
  await requireAdmin();

  const trimmed = label.trim();
  if (trimmed.length < 2) {
    return { error: "Please enter a name for the property type." };
  }

  const value = await uniquePropertyTypeValue(trimmed);
  const count = await db.propertyType.count();
  await db.propertyType.create({
    data: { value, label: trimmed, sortOrder: count },
  });

  revalidateTag(PROPERTY_TYPES_TAG, "max");
  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
  return { success: true };
}

export async function togglePropertyTypeActive(id: string) {
  await requireAdmin();

  const propertyType = await db.propertyType.findUnique({ where: { id } });
  if (!propertyType) {
    return { error: "Property type not found." };
  }

  await db.propertyType.update({
    where: { id },
    data: { isActive: !propertyType.isActive },
  });

  revalidateTag(PROPERTY_TYPES_TAG, "max");
  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
  return { success: true };
}

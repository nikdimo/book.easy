"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { revalidateTag, revalidatePath } from "next/cache";
import { PROPERTY_TYPES_TAG } from "@/lib/services/property-type.service";
import { uniquePropertyTypeValue } from "@/lib/utils/property-type";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import {
  DEFAULT_PROPERTY_TYPE_ICON,
  isPropertyTypeIconName,
} from "@/lib/property-type-icons";

export async function addPropertyType(
  label: string,
  description: string,
  icon: string = DEFAULT_PROPERTY_TYPE_ICON
) {
  await requireAdmin();

  const trimmed = label.trim();
  if (trimmed.length < 2) {
    return { error: "Please enter a name for the property type." };
  }
  const trimmedDescription = description.trim();
  if (trimmedDescription.length < 10 || trimmedDescription.length > 240) {
    return { error: "Please enter a description between 10 and 240 characters." };
  }
  if (!isPropertyTypeIconName(icon)) {
    return { error: "Please choose a valid property type icon." };
  }

  const value = await uniquePropertyTypeValue(trimmed);
  const count = await db.propertyType.count();
  await db.propertyType.create({
    data: {
      value,
      label: trimmed,
      description: trimmedDescription,
      icon,
      sortOrder: count,
    },
  });

  revalidateTag(PROPERTY_TYPES_TAG, "max");
  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
  return { success: true };
}

export async function updatePropertyType(
  id: string,
  label: string,
  description: string,
  icon: string,
  isActive: boolean
) {
  await requireAdmin();

  const trimmedLabel = label.trim();
  const trimmedDescription = description.trim();
  if (trimmedLabel.length < 2 || trimmedLabel.length > 80) {
    return { error: "Please enter a name between 2 and 80 characters." };
  }
  if (trimmedDescription.length < 10 || trimmedDescription.length > 240) {
    return { error: "Please enter a description between 10 and 240 characters." };
  }
  if (!isPropertyTypeIconName(icon)) {
    return { error: "Please choose a valid property type icon." };
  }

  const propertyType = await db.propertyType.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!propertyType) {
    return { error: "Property type not found." };
  }

  await db.propertyType.update({
    where: { id },
    data: {
      label: trimmedLabel,
      description: trimmedDescription,
      icon,
      isActive,
    },
  });

  revalidateTag(PROPERTY_TYPES_TAG, "max");
  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
  return { success: true };
}

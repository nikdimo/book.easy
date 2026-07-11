"use server";

import { requireAdmin } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import {
  addLanguageRecord,
  countLanguages,
  deleteLanguageByCode,
  getLanguageByCode,
  reorderLanguages,
  updateLanguageEnabled,
} from "@/lib/data/language.repository";

export async function addLanguage(code: string, name: string) {
  await requireAdmin();

  const existing = await getLanguageByCode(code);
  if (existing) {
    return { error: "That language is already in the list." };
  }

  const count = await countLanguages();
  await addLanguageRecord(code, name, count);

  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
  return { success: true };
}

export async function toggleLanguageEnabled(code: string) {
  await requireAdmin();

  const language = await getLanguageByCode(code);
  if (!language) {
    return { error: "Language not found." };
  }
  if (language.isDefault) {
    return { error: "The default language can't be disabled." };
  }

  await updateLanguageEnabled(code, !language.isEnabled);

  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
  return { success: true };
}

export async function removeLanguage(code: string) {
  await requireAdmin();

  const language = await getLanguageByCode(code);
  if (!language) {
    return { error: "Language not found." };
  }
  if (language.isDefault) {
    return { error: "The default language can't be removed." };
  }

  await deleteLanguageByCode(code);

  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
  return { success: true };
}

export async function reorderLanguageList(codesInOrder: string[]) {
  await requireAdmin();

  if (!Array.isArray(codesInOrder) || codesInOrder.length === 0) {
    return { error: "Invalid language order." };
  }

  await reorderLanguages(codesInOrder);

  revalidatePath("/admin/settings");
  revalidatePublicListingCaches();
  return { success: true };
}

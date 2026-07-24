"use server";

import { requireAdmin } from "@/lib/auth-helpers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import {
  getTranslationEntriesForLocale,
  scanUiStrings,
  syncTranslations,
  TranslationSyncLockedError,
} from "@/lib/services/ui-translation.service";

const PLACEHOLDER_RE = /\{[A-Za-z][A-Za-z0-9_]*\}/g;

export async function runTranslationSync() {
  await requireAdmin();

  try {
    const { found } = await scanUiStrings();
    const results = await syncTranslations();

    revalidatePath("/admin/settings");
    revalidatePath("/", "layout");

    // Batches are independent, so a run can partly succeed. Report that honestly
    // rather than showing a success toast over silently missing translations.
    const failed = results.reduce((total, result) => total + result.failed, 0);
    const translated = results.reduce((total, result) => total + result.translated, 0);
    if (failed > 0) {
      const detail = results
        .filter((result) => result.failed > 0)
        .map((result) => `${result.locale}: ${result.errors.join("; ")}`)
        .join(" | ");
      return {
        success: false as const,
        partial: true as const,
        found,
        results,
        error: `Translated ${translated} string(s), but ${failed} failed. ${detail}`,
      };
    }

    return { success: true as const, found, results };
  } catch (error) {
    if (error instanceof TranslationSyncLockedError) {
      return {
        success: false as const,
        error:
          "A translation sync is already running (possibly from a deployment). Try again once it finishes.",
      };
    }
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Translation sync failed. Check the server logs.",
    };
  }
}

export async function loadTranslationEntries(locale: string) {
  await requireAdmin();
  const language = await db.language.findUnique({ where: { code: locale } });
  if (!language || language.isDefault) return { success: false as const, error: "Language not found." };
  return { success: true as const, entries: await getTranslationEntriesForLocale(locale) };
}

export async function saveTranslationOverride(locale: string, key: string, value: string) {
  await requireAdmin();
  const trimmed = value.trim();
  if (!trimmed) return { success: false as const, error: "Translation cannot be empty." };
  const [language, uiString] = await Promise.all([
    db.language.findUnique({ where: { code: locale } }),
    db.uiString.findUnique({ where: { key } }),
  ]);
  if (!language || language.isDefault || !uiString?.isActive) {
    return { success: false as const, error: "Language or UI string not found." };
  }
  const sourcePlaceholders = [...uiString.sourceText.matchAll(PLACEHOLDER_RE)].map((match) => match[0]).sort();
  const valuePlaceholders = [...trimmed.matchAll(PLACEHOLDER_RE)].map((match) => match[0]).sort();
  if (sourcePlaceholders.join("\u0000") !== valuePlaceholders.join("\u0000")) {
    return { success: false as const, error: `Keep these placeholders unchanged: ${sourcePlaceholders.join(", ")}.` };
  }
  await db.uiTranslation.upsert({
    where: { locale_key: { locale, key } },
    create: { locale, key, value: trimmed, sourceTextSnapshot: uiString.sourceText, isManuallyEdited: true },
    update: { value: trimmed, sourceTextSnapshot: uiString.sourceText, isManuallyEdited: true },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
  return { success: true as const };
}

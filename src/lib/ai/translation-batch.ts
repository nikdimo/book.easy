import "server-only";
import { languageEditorGuidance } from "@/lib/i18n/reviewed-languages";
import { validateTranslationMap } from "@/lib/i18n/translation-validation";

/** A language a batch is translated into: the database locale code and its name. */
export interface TranslationTarget {
  code: string;
  name: string;
}

/** Shared rules so a locale reads the same regardless of which provider served the
 * request, and so provider prompts can't drift apart. */
export const TRANSLATION_RULES = [
  "You translate short website UI strings (buttons, labels, headings) from English for an accommodation marketplace.",
  "Keep translations concise and natural for a booking website, using each key as context. UI space is limited: for buttons, tabs, badges, labels, and headings, use the shortest natural wording that preserves the meaning. Do not add explanatory words that are absent from the English source.",
  "Keys under amenities.items describe facilities or equipment offered at a property; use that context to disambiguate short labels (for example, amenities.items.clothes_iron is the appliance, never the metal).",
  "For keys ending in .zero, .one, .two, .few, .many, or .other, use the grammar required by that CLDR plural category, even when the English source repeats.",
  "Preserve every placeholder such as {n} or {name} exactly, without translating or removing it.",
  "Preserve proper nouns exactly as written, including brand names, property names, city/town/village/region/country names, currency codes, product names, and URLs; never translate a place name semantically or replace it with an unrelated localized name.",
].join(" ");

/** One request covers every target locale: the source strings are sent once instead
 * of once per language, which is what keeps the sync inside provider rate limits. */
export function multiLocalePrompt(
  texts: Record<string, string>,
  targets: readonly TranslationTarget[],
): string {
  return [
    `Translate the values of this JSON object into ${targets.length} language(s).`,
    'Respond with ONLY one JSON object shaped as {"translations":{"<locale>":{"<key>":"<translated value>"}}}.',
    `It must contain exactly these locales: ${targets.map((target) => target.code).join(", ")}.`,
    "Every locale object must contain exactly the input keys with non-empty string values.",
    "Language-specific editorial guidance:",
    ...targets.map(
      (target) =>
        `${target.code} = ${target.name}: ${languageEditorGuidance(target.code)}`,
    ),
    `Entries: ${JSON.stringify(texts)}`,
  ].join("\n");
}

/** Parses a multi-locale response and validates each locale independently, so a
 * model that drops a locale or mangles a placeholder fails the batch instead of
 * writing broken copy to the database. */
export function parseMultiLocaleTranslations(
  texts: Record<string, string>,
  targets: readonly TranslationTarget[],
  responseText: string,
  label: string,
): Record<string, Record<string, string>> {
  const raw = responseText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${label} was not an object.`);
  }
  const translations = (parsed as { translations?: unknown }).translations;
  if (
    typeof translations !== "object" ||
    translations === null ||
    Array.isArray(translations)
  ) {
    throw new Error(`${label} had no "translations" object.`);
  }

  const byLocale = translations as Record<string, unknown>;
  const result: Record<string, Record<string, string>> = {};
  for (const target of targets) {
    if (!(target.code in byLocale)) {
      throw new Error(`${label} omitted locale ${target.code}.`);
    }
    result[target.code] = validateTranslationMap(
      texts,
      byLocale[target.code],
      `${label} (${target.code})`,
    );
  }
  return result;
}

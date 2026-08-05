export interface ReviewedLanguage {
  code: string;
  nativeName: string;
  englishName: string;
  aliases: readonly string[];
  primaryCountries: readonly string[];
  editorGuidance: string;
}

/**
 * Canonical configuration for languages whose fixed system copy is reviewed and
 * versioned. Runtime enablement still lives in the database, while generators,
 * validation, search aliases, and first-visit country defaults derive from here.
 *
 * Only unambiguous primary-language countries belong in `primaryCountries`.
 */
export const REVIEWED_LANGUAGES = [
  {
    code: "mk",
    nativeName: "Македонски",
    englishName: "Macedonian",
    aliases: ["makedonski", "makedonski jazik"],
    primaryCountries: ["MK"],
    editorGuidance:
      "Use standard, idiomatic Macedonian. Prefer polite plural imperatives for guest actions. Use оглас/огласете for listing a property, never изложба/изложете. Avoid Serbian or Bulgarian calques.",
  },
  {
    code: "sq",
    nativeName: "Shqip",
    englishName: "Albanian",
    aliases: ["shqip", "shqiptare"],
    primaryCountries: ["AL"],
    editorGuidance:
      "Use standard, idiomatic Albanian with concise marketplace wording and a consistent friendly-polite voice. Avoid word-for-word English syntax.",
  },
  {
    code: "sr",
    nativeName: "Српски",
    englishName: "Serbian",
    aliases: ["srpski", "serbian cyrillic"],
    primaryCountries: ["RS"],
    editorGuidance:
      "Use standard Serbian in Cyrillic and Ekavian consistently. Prefer concise, idiomatic booking-marketplace terminology and polite plural imperatives.",
  },
  {
    code: "tr",
    nativeName: "Türkçe",
    englishName: "Turkish",
    aliases: ["turkce", "türkçe"],
    primaryCountries: ["TR"],
    editorGuidance:
      "Use idiomatic modern Turkish, concise marketplace terminology, and consistent polite imperatives. Avoid literal English word order.",
  },
  {
    code: "bg",
    nativeName: "Български",
    englishName: "Bulgarian",
    aliases: ["bulgarski", "balgarski", "blgarski", "blgar"],
    primaryCountries: ["BG"],
    editorGuidance:
      "Use standard, idiomatic Bulgarian with concise marketplace wording and polite plural imperatives. Avoid Macedonian or Serbian forms.",
  },
  {
    code: "ro",
    nativeName: "Română",
    englishName: "Romanian",
    aliases: ["romana", "română", "roumanian"],
    primaryCountries: ["RO"],
    editorGuidance:
      "Use standard, idiomatic Romanian with correct diacritics, concise accommodation-marketplace terminology, and a natural friendly-polite voice.",
  },
  {
    code: "de",
    nativeName: "Deutsch",
    englishName: "German",
    aliases: ["deutsch"],
    primaryCountries: ["DE", "AT"],
    editorGuidance:
      "Use idiomatic standard German with concise marketplace terminology and consistent polite Sie-form wording where the guest is addressed.",
  },
  {
    code: "el",
    nativeName: "Ελληνικά",
    englishName: "Greek",
    aliases: ["ellinika", "elliniká"],
    primaryCountries: ["GR"],
    editorGuidance:
      "Use natural standard Modern Greek, concise accommodation-marketplace terminology, and consistent polite wording. Avoid literal English syntax.",
  },
  {
    code: "it",
    nativeName: "Italiano",
    englishName: "Italian",
    aliases: ["italiano"],
    primaryCountries: ["IT"],
    editorGuidance:
      "Use natural standard Italian with concise accommodation-marketplace terminology and a consistent friendly-polite product voice.",
  },
  {
    code: "fr",
    nativeName: "Français",
    englishName: "French",
    aliases: ["francais", "français"],
    primaryCountries: ["FR"],
    editorGuidance:
      "Use natural standard French with concise accommodation-marketplace terminology and consistent polite vous-form wording.",
  },
  {
    code: "es",
    nativeName: "Español",
    englishName: "Spanish",
    aliases: ["espanol", "español", "castellano"],
    primaryCountries: ["ES"],
    editorGuidance:
      "Use natural, internationally understandable Spanish with concise accommodation-marketplace terminology and a consistent friendly-polite voice.",
  },
  {
    code: "nl",
    nativeName: "Nederlands",
    englishName: "Dutch",
    aliases: ["nederlands", "hollands"],
    primaryCountries: ["NL"],
    editorGuidance:
      "Use natural standard Dutch with concise accommodation-marketplace terminology and consistent friendly-polite wording.",
  },
  {
    code: "pl",
    nativeName: "Polski",
    englishName: "Polish",
    aliases: ["polski"],
    primaryCountries: ["PL"],
    editorGuidance:
      "Use natural standard Polish with grammatically correct inflection, concise accommodation-marketplace terminology, and consistent polite wording.",
  },
  {
    code: "uk",
    nativeName: "Українська",
    englishName: "Ukrainian",
    aliases: ["ukrainska", "ukrayinska", "українська"],
    primaryCountries: ["UA"],
    editorGuidance:
      "Use natural standard Ukrainian with concise accommodation-marketplace terminology. Avoid Russian calques and preserve correct Ukrainian forms.",
  },
  {
    code: "ru",
    nativeName: "Русский",
    englishName: "Russian",
    aliases: ["russkiy", "russkii", "русский"],
    primaryCountries: ["RU"],
    editorGuidance:
      "Use natural standard Russian with concise accommodation-marketplace terminology and consistent polite plural imperatives.",
  },
] as const satisfies readonly ReviewedLanguage[];

export type ReviewedLocale = (typeof REVIEWED_LANGUAGES)[number]["code"];

const REVIEWED_LANGUAGE_BY_CODE = new Map<string, ReviewedLanguage>(
  REVIEWED_LANGUAGES.map((language) => [language.code, language])
);

export function getReviewedLanguage(code: string): ReviewedLanguage | undefined {
  return REVIEWED_LANGUAGE_BY_CODE.get(code);
}

export function reviewedLanguageSearchText(code: string, fallbackName = ""): string {
  const language = getReviewedLanguage(code);
  return language
    ? [
        language.nativeName,
        language.englishName,
        ...language.aliases,
        language.code,
      ].join(" ")
    : `${fallbackName} ${code}`;
}

export function languageEditorGuidance(code: string): string {
  return (
    getReviewedLanguage(code)?.editorGuidance ??
    "Use the standard native form of the target language with concise, natural accommodation-marketplace terminology."
  );
}

/** cmdk's default fuzzy matcher can surface unrelated languages for short Latin
 * searches. Language search is more predictable when every query token must occur
 * in the indexed native/English/alias text. Shared with the currency tab of the
 * regional-settings modal so both lists match identically. */
export { tokenContainmentScore as languageSearchScore } from "@/lib/utils/search-score";

import emailTranslations from "@/lib/email/i18n/email-translations.json";

/**
 * The reviewed translation package for system email, typed.
 *
 * Every supported language except English (the source) and Macedonian (hand-reviewed
 * inline in catalog.ts, where it sits beside the sentence it translates) is kept in
 * `email-translations.json`. It is checked into the repository rather than generated
 * at deploy time or read from the database for the same reason the Macedonian is: a
 * booking confirmation, a decline, a claim response and a sign-in link are messages
 * where a wrong or missing translation costs someone real money or a stay, and every
 * line of them should be readable in a diff.
 *
 * `sources` records the English each translation was made from. `resolveEmailString`
 * refuses a translation whose recorded source no longer matches the sentence the
 * template says, so rewording an English line reverts that one string to reviewed
 * English instead of sending a translation of copy the product has retired.
 *
 * Languages carry only the plural categories they use: `pl` has `one`/`few`/`many`
 * and no `other`, because `Intl.PluralRules("pl")` never selects `other` for a whole
 * number of guests.
 *
 * The cast is here, once. TypeScript infers a union of literal object types from the
 * JSON — one member per differing plural-category set — which is accurate and
 * unusable; every consumer wants "some subset of the email keys".
 */
export interface EmailTranslationPackage {
  schemaVersion: number;
  sourceLanguage: string;
  /** key → the English it was translated from. */
  sources: Record<string, string>;
  languages: {
    code: string;
    name: string;
    /** key → translation. Absent keys are the ones this language never reaches. */
    translations: Record<string, string>;
  }[];
}

export const EMAIL_TRANSLATIONS = emailTranslations as unknown as EmailTranslationPackage;

export const EMAIL_TRANSLATIONS_BY_LOCALE = new Map(
  EMAIL_TRANSLATIONS.languages.map((language) => [language.code, language.translations]),
);

/** The English each translation in the package was made from. */
export const EMAIL_TRANSLATED_FROM = EMAIL_TRANSLATIONS.sources;

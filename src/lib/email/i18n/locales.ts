import { DEFAULT_LOCALE, normalizeLocaleCode } from "@/lib/i18n/locale-preference";
import { REVIEWED_LANGUAGES, type ReviewedLocale } from "@/lib/i18n/reviewed-languages";

/**
 * Hand-reviewed inline catalog columns: the English source and the Macedonian that
 * sits beside it in catalog.ts. Every other supported language lives in
 * email-translations.json.
 */
export const EMAIL_LOCALES = [DEFAULT_LOCALE, "mk"] as const;

export type EmailLocale = typeof DEFAULT_LOCALE | ReviewedLocale;

/**
 * Every language a system email can be sent in. A booking confirmation, a sign-in
 * link or an account-deletion link is a message where falling back to English is a
 * failure the recipient notices, so this list is a commitment: adding a language
 * here means every current email key must be translated into it, and
 * `src/lib/email/__tests__/email-translation-completeness.test.ts` fails until it is.
 */
export const SUPPORTED_EMAIL_LOCALES = [
  DEFAULT_LOCALE,
  ...REVIEWED_LANGUAGES.map((language) => language.code),
] as const satisfies readonly EmailLocale[];

export function isEmailLocale(value: string | null | undefined): value is EmailLocale {
  return value === DEFAULT_LOCALE || REVIEWED_LANGUAGES.some((language) => language.code === value);
}

/**
 * Resolves the language for a recipient's mail from their stored account locale.
 * Anything unsupported — null, a language we don't review, a malformed code —
 * becomes English. Regional variants collapse to their base language ("mk-MK"
 * is Macedonian), since the catalog is keyed by language alone.
 */
export function resolveEmailLocale(locale: string | null | undefined): EmailLocale {
  const normalized = normalizeLocaleCode(locale);
  if (!normalized) return DEFAULT_LOCALE;
  const base = normalized.split("-")[0];
  return isEmailLocale(base) ? base : DEFAULT_LOCALE;
}

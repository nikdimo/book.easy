import { REVIEWED_LANGUAGES } from "@/lib/i18n/reviewed-languages";

export const DEFAULT_LOCALE = "en";
export const SITE_LOCALE_COOKIE = "bookeasy_locale";
/** Distinguishes a language picked by the person from a country/browser default the
 * proxy cached for first-paint stability. Account preferences must beat the latter. */
export const SITE_LOCALE_EXPLICIT_COOKIE = "bookeasy_locale_explicit";
export const GOOGLE_TRANSLATE_COOKIE = "googtrans";
export const GOOGLE_TRANSLATE_SOURCE = "auto";

const LOCALE_CODE_RE = /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i;

/**
 * Country defaults are deliberately limited to languages whose system copy has a
 * reviewed translation snapshot. Visitors from all other countries start in
 * English and can still select any language exposed by Google Translate.
 *
 * Ambiguous multilingual countries are omitted rather than guessing incorrectly.
 */
const REVIEWED_LOCALE_BY_COUNTRY: Readonly<Record<string, string>> =
  Object.fromEntries(
    REVIEWED_LANGUAGES.flatMap((language) =>
      language.primaryCountries.map((country) => [country, language.code])
    )
  );

export function normalizeLocaleCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !LOCALE_CODE_RE.test(trimmed)) return null;

  const [language, region] = trimmed.split("-");
  return region ? `${language.toLowerCase()}-${region.toUpperCase()}` : language.toLowerCase();
}

export function localeFromGoogleTranslateCookie(
  value: string | null | undefined
): string | null {
  const match = value?.match(/^\/[^/]+\/([^/]+)$/);
  return normalizeLocaleCode(match?.[1]);
}

export function googleTranslateCookieValue(locale: string): string {
  return `/${GOOGLE_TRANSLATE_SOURCE}/${locale}`;
}

export function localeFromCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return REVIEWED_LOCALE_BY_COUNTRY[country.trim().toUpperCase()] ?? null;
}

export interface LocalePreferenceInput {
  /** A language the visitor explicitly picked in this browser. */
  explicit?: string | null;
  /** A detected/default language cached by the proxy for first-paint stability. */
  siteLocale?: string | null;
  googleTranslate?: string | null;
  /** The signed-in account's stored choice, carried to the edge on the JWT. */
  account?: string | null;
  country?: string | null;
}

export interface LocalePreference {
  locale: string;
  source: "explicit" | "account" | "browser" | "legacy-google" | "country" | "default";
}

/**
 * An explicit Linger Homes choice always wins. The legacy Google cookie is accepted
 * next so existing visitors keep their selection while migrating to the dedicated
 * application cookie.
 */
export function resolveLocalePreference({
  explicit: explicitValue,
  siteLocale,
  googleTranslate,
  account,
  country,
}: LocalePreferenceInput): LocalePreference {
  const explicit = normalizeLocaleCode(explicitValue);
  if (explicit) return { locale: explicit, source: "explicit" };

  const accountLocale = normalizeLocaleCode(account);
  if (accountLocale) return { locale: accountLocale, source: "account" };

  const browserLocale = normalizeLocaleCode(siteLocale);
  if (browserLocale) return { locale: browserLocale, source: "browser" };

  const legacyGoogle = localeFromGoogleTranslateCookie(googleTranslate);
  if (legacyGoogle) return { locale: legacyGoogle, source: "legacy-google" };

  const countryLocale = localeFromCountry(country);
  if (countryLocale) return { locale: countryLocale, source: "country" };

  return { locale: DEFAULT_LOCALE, source: "default" };
}

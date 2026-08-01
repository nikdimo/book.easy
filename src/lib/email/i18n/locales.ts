import { DEFAULT_LOCALE, normalizeLocaleCode } from "@/lib/i18n/locale-preference";

/**
 * Deliberately narrower than the site's language list. A booking confirmation, a
 * sign-in link or an account-deletion link is a message where a bad translation
 * causes real harm, and only Macedonian has been read end to end by a native
 * speaker. Everything else falls back to English, which the recipient's mail
 * client will offer to translate for them — better than shipping machine output
 * nobody has reviewed.
 *
 * Adding a locale here is a commitment to review every template in it.
 */
export const EMAIL_LOCALES = [DEFAULT_LOCALE, "mk"] as const;

export type EmailLocale = (typeof EMAIL_LOCALES)[number];

export function isEmailLocale(value: string | null | undefined): value is EmailLocale {
  return (EMAIL_LOCALES as readonly string[]).includes(value ?? "");
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

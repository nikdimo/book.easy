import "server-only";
import { cookies } from "next/headers";
import {
  GOOGLE_TRANSLATE_COOKIE,
  SITE_LOCALE_COOKIE,
  localeFromGoogleTranslateCookie,
  normalizeLocaleCode,
} from "@/lib/i18n/locale-preference";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale-preference";

/**
 * The locale of the request currently being handled, for the rare email sent while
 * the recipient is still on the site — the sign-in link, which is triggered before
 * any account (and therefore any stored locale) necessarily exists.
 *
 * Every other email must use the recipient's stored `User.locale` instead: they are
 * sent by background jobs where there is no request and no cookie.
 *
 * Reads the cookies directly rather than going through `getT()`, which would drag
 * the database-backed UI catalog into the auth module for a value it doesn't need.
 * Falls back to English outside a request context.
 */
export async function getRequestLocale(): Promise<string> {
  try {
    const store = await cookies();
    return (
      normalizeLocaleCode(store.get(SITE_LOCALE_COOKIE)?.value) ??
      localeFromGoogleTranslateCookie(store.get(GOOGLE_TRANSLATE_COOKIE)?.value) ??
      DEFAULT_LOCALE
    );
  } catch {
    return DEFAULT_LOCALE;
  }
}

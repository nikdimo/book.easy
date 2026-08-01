import { DEFAULT_LOCALE } from "@/lib/i18n/locale-preference";
import { EMAIL_CATALOG } from "@/lib/email/i18n/catalog";
import { resolveEmailLocale, type EmailLocale } from "@/lib/email/i18n/locales";

/**
 * Email translation is deliberately unlike `getT()`.
 *
 * `getT()` reads the request's locale cookie and the database-backed AI catalog.
 * Neither is available here: most mail is sent by background jobs (see
 * scripts/send-review-reminders.ts, scripts/process-booking-requests.ts) hours
 * after any request ended, and an external translation call in the send path
 * would mean a slow or failed API delays or loses a booking confirmation.
 *
 * So this resolves synchronously against a catalog compiled into the bundle, from
 * the recipient's *stored* locale. No I/O, nothing to fail, nothing to wait on.
 */
export interface EmailTranslator {
  locale: EmailLocale;
  /** Resolves `key`, falling back to the English `source` literal. */
  t(key: string, source: string): string;
  /** Resolves `key`, then substitutes `{placeholders}` from `vars`. */
  ti(key: string, source: string, vars: Record<string, string | number>): string;
}

function interpolate(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function getEmailT(locale: string | null | undefined): EmailTranslator {
  const resolved = resolveEmailLocale(locale);

  const t = (key: string, source: string): string => {
    if (resolved === DEFAULT_LOCALE) return source;
    const entry = EMAIL_CATALOG[key];
    // The catalog's English column doubles as the source snapshot, exactly as
    // `sourceTextSnapshot` does for UI translations. Edit an English sentence at
    // the call site and this key reverts to English until the Macedonian is
    // re-reviewed — a reviewed fallback beats a stale mistranslation, and it
    // fails that way without anyone having to remember to re-run anything.
    if (!entry || entry[DEFAULT_LOCALE] !== source) return source;
    return entry[resolved] || source;
  };

  return {
    locale: resolved,
    t,
    ti: (key, source, vars) => interpolate(t(key, source), vars),
  };
}

import { DEFAULT_LOCALE } from "@/lib/i18n/locale-preference";
import { EMAIL_CATALOG } from "@/lib/email/i18n/catalog";
import { resolveEmailLocale, type EmailLocale } from "@/lib/email/i18n/locales";
import {
  EMAIL_TRANSLATED_FROM as TRANSLATED_FROM,
  EMAIL_TRANSLATIONS_BY_LOCALE as TRANSLATIONS_BY_LOCALE,
} from "@/lib/email/i18n/translations";

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

/**
 * Resolves one email string in `locale`, or the English `source` when no reviewed
 * translation applies.
 *
 * Exported so the completeness test can ask the same question the send path asks —
 * "what does a recipient in this language actually receive for this key" — rather
 * than reading one of the two stores and assuming the other agrees.
 */
export function resolveEmailString(
  locale: EmailLocale,
  key: string,
  source: string,
): string {
  if (locale === DEFAULT_LOCALE) return source;

  const entry = EMAIL_CATALOG[key];
  // The catalog's English column doubles as the source snapshot, exactly as
  // `sourceTextSnapshot` does for UI translations. Edit an English sentence at
  // the call site and this key reverts to English until the translations are
  // re-reviewed — a reviewed fallback beats a stale mistranslation, and it
  // fails that way without anyone having to remember to re-run anything.
  if (!entry || entry[DEFAULT_LOCALE] !== source) return source;

  // Macedonian is hand-reviewed inline in catalog.ts, where it sits next to the
  // English it translates and is read in the diff.
  if (locale === "mk") return entry.mk || source;

  // Every other language comes from email-translations.json, which records the
  // English each string was translated from. Two snapshots have to agree before a
  // translation is sent: the call site's, and the package's. Update one without the
  // other and the recipient gets reviewed English instead of a sentence that no
  // longer says what the product says.
  if (TRANSLATED_FROM[key] !== source) return source;
  return TRANSLATIONS_BY_LOCALE.get(locale)?.[key] || source;
}

export function getEmailT(locale: string | null | undefined): EmailTranslator {
  const resolved = resolveEmailLocale(locale);
  const t = (key: string, source: string) => resolveEmailString(resolved, key, source);

  return {
    locale: resolved,
    t,
    ti: (key, source, vars) => interpolate(t(key, source), vars),
  };
}

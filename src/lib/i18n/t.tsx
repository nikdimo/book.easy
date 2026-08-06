import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getLocaleCatalog } from "@/lib/i18n/translation-cache";
import {
  DEFAULT_LOCALE,
  GOOGLE_TRANSLATE_COOKIE,
  SITE_LOCALE_COOKIE,
  localeFromGoogleTranslateCookie,
  normalizeLocaleCode,
} from "@/lib/i18n/locale-preference";

const SOURCE_LANGUAGE = DEFAULT_LOCALE;

/** Reads Linger Homes' explicit locale preference. The Google cookie remains a
 *  migration fallback for visitors who selected a language before this cookie was
 *  introduced. */
export const getLocale = cache(async (): Promise<string> => {
  const store = await cookies();
  return (
    normalizeLocaleCode(store.get(SITE_LOCALE_COOKIE)?.value) ??
    localeFromGoogleTranslateCookie(store.get(GOOGLE_TRANSLATE_COOKIE)?.value) ??
    SOURCE_LANGUAGE
  );
});

export function localeDirection(locale: string): "ltr" | "rtl" {
  return /^(ar|fa|he|ur)(-|$)/i.test(locale) ? "rtl" : "ltr";
}

export interface Resolved {
  text: string;
  translated: boolean;
}

export interface Translator {
  locale: string;
  messages: TranslationMessages;
  /** Resolves a key to its translated value, falling back to `source` when the
   *  locale has no AI translation enabled, or this specific key isn't translated
   *  (or is stale) yet — Google Translate's live DOM translation catches the rest. */
  resolve(key: string, source: string): Resolved;
}

/** Client-facing payload: `key -> translated value`. Snapshots are deliberately not
 *  included — staleness is settled server-side when the locale catalog is built (see
 *  lib/i18n/translation-cache.ts), so every entry here is already known to match the
 *  source literal it will be resolved against. */
export type TranslationMessages = Record<string, string>;

/** Builds a translator scoped to the current request's locale. Call once per request
 *  (e.g. at the top of a server component) and reuse the returned functions. */
export const getTForLocale = cache(async (requestedLocale: string): Promise<Translator> => {
  const locale = normalizeLocaleCode(requestedLocale) ?? SOURCE_LANGUAGE;
  if (locale === SOURCE_LANGUAGE) {
    return {
      locale,
      messages: {},
      resolve: (_key, source) => ({ text: source, translated: false }),
    };
  }

  const catalog = await getLocaleCatalog(locale);

  if (!catalog.enabled) {
    return {
      locale: SOURCE_LANGUAGE,
      messages: {},
      resolve: (_key, source) => ({ text: source, translated: false }),
    };
  }
  if (!catalog.active) {
    return {
      locale,
      messages: {},
      resolve: (_key, source) => ({ text: source, translated: false }),
    };
  }

  return {
    locale,
    messages: catalog.clientMessages,
    resolve: (key, source) => {
      // Server-side resolution still compares against the stored snapshot, so this
      // path's staleness behavior is byte-for-byte what it was before caching.
      const entry = catalog.entries[key];
      if (entry && entry.sourceTextSnapshot === source) {
        return { text: entry.value, translated: true };
      }
      return { text: source, translated: false };
    },
  };
});

export const getT = cache(async (): Promise<Translator> =>
  getTForLocale(await getLocale()),
);

export type PluralCategory = Intl.LDMLPluralRule;
export type PluralForms = Record<PluralCategory, Resolved>;

/** Resolves all CLDR plural categories. The English source has one singular and one
 * plural form; translators receive the category in the generated key and produce the
 * grammar appropriate for the target locale. */
export function pluralForms(
  translator: Translator,
  keyBase: string,
  singular: string,
  plural: string
): PluralForms {
  return Object.fromEntries(
    (["zero", "one", "two", "few", "many", "other"] as PluralCategory[]).map(
      (category) => [
        category,
        translator.resolve(`${keyBase}.${category}`, category === "one" ? singular : plural),
      ]
    )
  ) as PluralForms;
}

/** Plain-string variant for non-JSX contexts (aria-label, placeholder, alt) where
 *  wrapping in `notranslate` isn't relevant since Google Translate doesn't touch
 *  attribute text. Prefer `<T>` for visible JSX text. */
export function t(translator: Translator, key: string, source: string): string {
  return translator.resolve(key, source).text;
}

/** Resolves a key whose source text contains `{placeholders}` (e.g. "Hosted by
 *  {name}"), then substitutes `vars` into the resolved text. The source string is
 *  still a literal, so the extraction scanner sees it fine — placeholders survive
 *  translation because the AI system prompt is told to preserve them verbatim. */
export function ti(
  translator: Translator,
  key: string,
  source: string,
  vars: Record<string, string | number>
): Resolved {
  const resolved = translator.resolve(key, source);
  const text = resolved.text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
  return { text, translated: resolved.translated };
}

/** Resolves a pluralized count+noun string (e.g. "1 guest" / "{n} guests") by
 *  picking the singular/plural literal source and substituting the count via `ti`. */
export function tPlural(
  translator: Translator,
  keyBase: string,
  count: number,
  singular: string,
  plural: string
): Resolved {
  const category = new Intl.PluralRules(translator.locale).select(count);
  return ti(translator, `${keyBase}.${category}`, category === "one" ? singular : plural, {
    n: count,
  });
}

/** Renders fixed UI text, marking real AI translations `notranslate` so Google
 *  Translate's live DOM translation doesn't re-translate an already-correct string.
 *  Fallback text (untranslated) is left unmarked so Google can still catch it. */
export function T({
  t: translator,
  k,
  source,
}: {
  t: Translator;
  k: string;
  source: string;
}) {
  const { text, translated } = translator.resolve(k, source);
  return translated ? <span className="notranslate">{text}</span> : <>{text}</>;
}

/** Renders a translated template while leaving interpolated database/user content
 * available to Google's page translator. Only the reviewed fixed grammar fragments
 * receive `notranslate`; wrapping the whole sentence would also protect values such
 * as a host-authored property type from translation. */
export function TWithValues({
  t: translator,
  k,
  source,
  values,
  protectedValues = [],
}: {
  t: Translator;
  k: string;
  source: string;
  values: Record<string, string | number>;
  /** Placeholder values that are proper names or identifiers and must not be
   * machine-translated (for example a city name such as "Bitola"). */
  protectedValues?: readonly string[];
}) {
  const { text, translated } = translator.resolve(k, source);
  const protectedValueNames = new Set(protectedValues);
  return (
    <>
      {text.split(/(\{\w+\})/g).map((part, index) => {
        const placeholder = part.match(/^\{(\w+)\}$/)?.[1];
        if (placeholder && placeholder in values) {
          const isProtected = protectedValueNames.has(placeholder);
          return (
            <span
              key={`${placeholder}-${index}`}
              className={isProtected ? "notranslate" : undefined}
              translate={isProtected ? "no" : undefined}
              suppressHydrationWarning
            >
              {values[placeholder]}
            </span>
          );
        }
        if (!part) return null;
        return translated ? (
          <span
            className="notranslate"
            key={`text-${index}`}
            translate="no"
            suppressHydrationWarning
          >
            {part}
          </span>
        ) : (
          // Google Translate replaces text nodes with <font> wrappers. Keeping each
          // translatable fragment inside its own hydration-tolerant span prevents
          // that third-party mutation from invalidating the surrounding React tree.
          <span key={`text-${index}`} suppressHydrationWarning>
            {part}
          </span>
        );
      })}
    </>
  );
}

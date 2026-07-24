import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const COOKIE_NAME = "googtrans";
const SOURCE_LANGUAGE = "en";

/** Reads the same `googtrans` cookie the Google Translate widget uses, so there is a
 *  single source of truth for "what language is this visitor viewing in." */
export const getLocale = cache(async (): Promise<string> => {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const match = raw?.match(/^\/[^/]+\/([^/]+)$/);
  return match?.[1] ?? SOURCE_LANGUAGE;
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

export type TranslationMessages = Record<
  string,
  { value: string; sourceTextSnapshot: string }
>;

/** Builds a translator scoped to the current request's locale. Call once per request
 *  (e.g. at the top of a server component) and reuse the returned functions. */
export const getT = cache(async (): Promise<Translator> => {
  const locale = await getLocale();

  if (locale === SOURCE_LANGUAGE) {
    return {
      locale,
      messages: {},
      resolve: (_key, source) => ({ text: source, translated: false }),
    };
  }

  const language = await db.language.findUnique({ where: { code: locale } });
  if (!language?.isEnabled) {
    return {
      locale: SOURCE_LANGUAGE,
      messages: {},
      resolve: (_key, source) => ({ text: source, translated: false }),
    };
  }
  if (!language.useAiTranslation) {
    return {
      locale,
      messages: {},
      resolve: (_key, source) => ({ text: source, translated: false }),
    };
  }

  const rows = await db.uiTranslation.findMany({ where: { locale } });
  const map = new Map(rows.map((row) => [row.key, row]));
  const messages = Object.fromEntries(
    rows.map((row) => [
      row.key,
      { value: row.value, sourceTextSnapshot: row.sourceTextSnapshot },
    ])
  );

  return {
    locale,
    messages,
    resolve: (key, source) => {
      const row = map.get(key);
      if (row && row.sourceTextSnapshot === source) {
        return { text: row.value, translated: true };
      }
      return { text: source, translated: false };
    },
  };
});

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

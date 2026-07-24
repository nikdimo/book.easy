"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type {
  PluralCategory,
  PluralForms,
  Resolved,
  TranslationMessages,
} from "@/lib/i18n/t";

const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"] as const;

interface ClientTranslator {
  locale: string;
  resolve(key: string, source: string): Resolved;
  plural(keyBase: string, count: number, singular: string, plural: string): Resolved;
}

const FALLBACK: ClientTranslator = {
  locale: "en",
  resolve: (_key, source) => ({ text: source, translated: false }),
  plural: (_keyBase, count, singular, plural) => ({
    text: (count === 1 ? singular : plural).replace("{n}", String(count)),
    translated: false,
  }),
};

const I18nContext = createContext<ClientTranslator>(FALLBACK);

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: string;
  messages: TranslationMessages;
  children: ReactNode;
}) {
  const value = useMemo<ClientTranslator>(() => {
    const resolve = (key: string, source: string): Resolved => {
      const message = messages[key];
      return message?.sourceTextSnapshot === source
        ? { text: message.value, translated: true }
        : { text: source, translated: false };
    };
    return {
      locale,
      resolve,
      plural: (keyBase, count, singular, plural) => {
        const category = new Intl.PluralRules(locale).select(count) as PluralCategory;
        const resolved = resolve(
          `${keyBase}.${category}`,
          category === "one" ? singular : plural
        );
        return { ...resolved, text: resolved.text.replace("{n}", String(count)) };
      },
    };
  }, [locale, messages]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): ClientTranslator {
  return useContext(I18nContext);
}

export function Tx({ k, source }: { k: string; source: string }) {
  const resolved = useI18n().resolve(k, source);
  return resolved.translated ? <span className="notranslate">{resolved.text}</span> : <>{source}</>;
}

export function translatedClass(resolved: Resolved): string | undefined {
  return resolved.translated ? "notranslate" : undefined;
}

/** Client-side counterpart of the server `pluralForms()` — resolves every CLDR
 * category up front so a component can select later (e.g. after a count changes)
 * without re-resolving. The argument order matches the server helper so the AST
 * extractor recognises it and generates the same six keys. */
export function pluralForms(
  translator: Pick<ClientTranslator, "resolve">,
  keyBase: string,
  singular: string,
  plural: string
): PluralForms {
  return Object.fromEntries(
    PLURAL_CATEGORIES.map((category) => [
      category,
      translator.resolve(`${keyBase}.${category}`, category === "one" ? singular : plural),
    ])
  ) as PluralForms;
}

/** Selects the CLDR category for `count` from pre-resolved forms and substitutes
 * `{n}`. Selection uses `Intl.PluralRules`, never `count === 1` — the category named
 * `one` is not "the number 1" (Macedonian selects `one` for 21 and 31 as well). */
export function pluralText(forms: PluralForms, count: number, locale: string): Resolved {
  const category = new Intl.PluralRules(locale).select(count);
  const template = forms[category] ?? forms.other;
  return {
    text: template.text.replace("{n}", String(count)),
    translated: template.translated,
  };
}

/** Substitutes placeholders into a value that was already resolved (server-side or
 * via `useI18n`). The server's `ti()` cannot be used here because `t.tsx` is
 * `server-only`; this performs substitution only, never a translation lookup. */
export function interpolate(
  template: Resolved,
  vars: Record<string, string | number>
): Resolved {
  const text = template.text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
  return { text, translated: template.translated };
}

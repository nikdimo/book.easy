import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMAIL_CATALOG } from "@/lib/email/i18n/catalog";
import { resolveEmailString } from "@/lib/email/i18n";
import {
  SUPPORTED_EMAIL_LOCALES,
  type EmailLocale,
} from "@/lib/email/i18n/locales";
import {
  CASE_STATUS_LABELS,
  CLAIM_KIND_LABELS,
  CLAIM_RESPONSE_LABELS,
  caseStatusKey,
  claimKindKey,
  claimResponseKey,
  guestCountSource,
  integerPluralCategories,
} from "@/lib/email/i18n/dynamic-keys";
import { EMAIL_TRANSLATIONS as translations } from "@/lib/email/i18n/translations";

/**
 * The guarantee this file exists to keep: a recipient who has chosen one of the
 * sixteen supported languages receives every sentence of every system email in that
 * language. Not most of them. Not the ones somebody remembered to add.
 *
 * Falling back to English is the *safe* behaviour at run time — a reviewed English
 * sentence beats a translation of copy the product no longer says — but it is silent,
 * and nobody reads their own outgoing mail in fourteen languages. So every way an
 * email can quietly turn English is a failure here instead:
 *
 *   - a key with no translation in some language
 *   - a translation of an English sentence that has since been reworded
 *   - a placeholder dropped, renamed, or invented
 *   - an empty string standing in for a translation
 *   - a new email, or a new enum value inside an existing one, added without
 *     translations
 *
 * `catalog.test.ts` is the other half of this: it checks the English column against
 * the literals in the templates. This file checks every other language against that
 * English column, and checks what `resolveEmailString` — the function the send path
 * actually calls — returns for each one.
 */

const SENDER_FILES = [
  "src/lib/email/index.ts",
  "src/lib/auth.ts",
  "src/lib/services/account-deletion.service.ts",
];

/** Matches `t.t("key", "source"` and `t.ti("key", 'source'`, in either quote style
 * and across line breaks, which is how Prettier leaves the longer templates. */
const CALL_RE =
  /\bt\.(?:t|ti)\(\s*(['"])(email\.[^'"]+)\1\s*,\s*(['"])((?:\\.|(?!\3)[\s\S])*?)\3/g;

function unescape(literal: string): string {
  return literal
    .replaceAll("\\'", "'")
    .replaceAll('\\"', '"')
    .replaceAll("\\n", "\n")
    .replaceAll("\\\\", "\\");
}

interface Requirement {
  key: string;
  /** The English literal the template passes, and the fallback if anything is off. */
  source: string;
  /** Which locales must carry this string. Plural forms differ per language. */
  locales: readonly EmailLocale[];
  origin: string;
}

/** Every `t.t`/`t.ti` literal in the templates. */
function literalRequirements(): Requirement[] {
  return SENDER_FILES.flatMap((file) => {
    const contents = readFileSync(join(process.cwd(), file), "utf8");
    return [...contents.matchAll(CALL_RE)].map((match) => ({
      key: match[2],
      source: unescape(match[4]),
      locales: SUPPORTED_EMAIL_LOCALES,
      origin: file,
    }));
  });
}

/** Every key the templates build at run time, from the tables they build them from. */
function dynamicRequirements(): Requirement[] {
  const fromTable = (
    labels: Record<string, string>,
    toKey: (value: string) => string,
    origin: string,
  ): Requirement[] =>
    Object.entries(labels).map(([value, source]) => ({
      key: toKey(value),
      source,
      locales: SUPPORTED_EMAIL_LOCALES,
      origin,
    }));

  // A guest count only reaches the categories its own language uses. Requiring
  // Polish `other` (which Intl never selects for a whole number) would be noise;
  // *not* requiring Polish `few` is how "3 goście" shipped as "3 guests".
  const plurals = SUPPORTED_EMAIL_LOCALES.flatMap((locale) =>
    integerPluralCategories(locale).map((category) => ({
      key: `email.booking.guest_count.${category}`,
      source: guestCountSource(category),
      locales: [locale] as const,
      origin: `Intl.PluralRules("${locale}")`,
    })),
  );

  return [
    ...fromTable(CASE_STATUS_LABELS, caseStatusKey, "CASE_STATUS_LABELS"),
    ...fromTable(CLAIM_KIND_LABELS, claimKindKey, "CLAIM_KIND_LABELS"),
    ...fromTable(CLAIM_RESPONSE_LABELS, claimResponseKey, "CLAIM_RESPONSE_LABELS"),
    ...plurals,
  ];
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

const REQUIREMENTS = [...literalRequirements(), ...dynamicRequirements()];

const STORED = new Map(
  translations.languages.map((language) => [language.code, language.translations]),
);
const TRANSLATED_FROM = translations.sources;

/** What the store holds for one locale and key, wherever that locale is kept. */
function stored(locale: EmailLocale, key: string): string | undefined {
  if (locale === "en") return EMAIL_CATALOG[key]?.en;
  if (locale === "mk") return EMAIL_CATALOG[key]?.mk;
  return STORED.get(locale)?.[key];
}

describe("email translation completeness", () => {
  it("finds the strings it is meant to be checking", () => {
    // A scanner that matched nothing would make every assertion below pass while
    // checking absolutely nothing.
    expect(literalRequirements().length).toBeGreaterThan(80);
    expect(dynamicRequirements().length).toBeGreaterThan(20);
    expect(SUPPORTED_EMAIL_LOCALES).toHaveLength(16);
  });

  it("covers every supported language for every string an email can send", () => {
    const missing = REQUIREMENTS.flatMap((requirement) =>
      requirement.locales
        .filter((locale) => !stored(locale, requirement.key)?.trim())
        .map((locale) => `${requirement.key} (${locale}) — from ${requirement.origin}`),
    );
    expect([...new Set(missing)].sort()).toEqual([]);
  });

  it("translates the English the templates currently say", () => {
    // A reworded English sentence leaves its translations describing something the
    // product no longer offers. Both snapshots — the catalog's English column and
    // the package's `sources` — have to still match the literal at the call site.
    const stale = REQUIREMENTS.flatMap((requirement) => {
      const problems: string[] = [];
      const english = EMAIL_CATALOG[requirement.key]?.en;
      if (english !== requirement.source) {
        problems.push(
          `${requirement.key}: catalog English is ${JSON.stringify(english)}, ` +
            `template says ${JSON.stringify(requirement.source)} (${requirement.origin})`,
        );
      }
      const from = TRANSLATED_FROM[requirement.key];
      if (from !== requirement.source) {
        problems.push(
          `${requirement.key}: translations were made from ${JSON.stringify(from)}, ` +
            `template says ${JSON.stringify(requirement.source)} (${requirement.origin})`,
        );
      }
      return problems;
    });
    expect([...new Set(stale)].sort()).toEqual([]);
  });

  it("keeps every placeholder, unrenamed, in every language", () => {
    // A dropped {deadline} or {reference} turns a booking email into one that is
    // grammatical, plausible, and missing the only fact the recipient needed. A
    // renamed one prints the braces to the recipient verbatim.
    const broken = REQUIREMENTS.flatMap((requirement) => {
      const expected = placeholders(requirement.source).join(", ");
      return requirement.locales
        .map((locale) => ({ locale, value: stored(locale, requirement.key) }))
        .filter(({ value }) => value && placeholders(value).join(", ") !== expected)
        .map(
          ({ locale, value }) =>
            `${requirement.key} (${locale}): expected {${expected}}, got ` +
            `{${placeholders(value!).join(", ")}} in ${JSON.stringify(value)}`,
        );
    });
    expect([...new Set(broken)].sort()).toEqual([]);
  });

  it("holds no empty or whitespace-only translation anywhere in the package", () => {
    const empty = translations.languages.flatMap((language) =>
      Object.entries(language.translations)
        .filter(([, value]) => !value.trim())
        .map(([key]) => `${key} (${language.code})`),
    );
    expect(empty.sort()).toEqual([]);
  });

  it("actually delivers the translation through the send path", () => {
    // Presence in a file proves nothing on its own: `resolveEmailString` is what
    // every template calls, and it has its own reasons to hand back English.
    const fellBack = REQUIREMENTS.flatMap((requirement) =>
      requirement.locales
        .filter((locale) => locale !== "en")
        .filter(
          (locale) =>
            resolveEmailString(locale, requirement.key, requirement.source) !==
            stored(locale, requirement.key),
        )
        .map((locale) => `${requirement.key} (${locale})`),
    );
    expect([...new Set(fellBack)].sort()).toEqual([]);
  });

  it("carries no translation for a string no email sends", () => {
    // Orphans are how a package drifts into looking complete while the sentence the
    // product actually sends has no translation at all.
    const required = new Set(REQUIREMENTS.map((requirement) => requirement.key));
    const orphaned = translations.languages.flatMap((language) =>
      Object.keys(language.translations)
        .filter((key) => !required.has(key))
        .map((key) => `${key} (${language.code})`),
    );
    expect([...new Set(orphaned)].sort()).toEqual([]);
  });

  it("keeps the package aligned with the languages the product offers", () => {
    expect(translations.languages.map((language) => language.code)).toEqual(
      SUPPORTED_EMAIL_LOCALES.filter((locale) => locale !== "en" && locale !== "mk"),
    );
    expect(Object.keys(TRANSLATED_FROM).sort()).toEqual(Object.keys(EMAIL_CATALOG).sort());
  });
});

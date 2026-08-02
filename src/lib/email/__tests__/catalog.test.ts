import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EMAIL_CATALOG } from "@/lib/email/i18n/catalog";
import { EMAIL_LOCALES } from "@/lib/email/i18n/locales";

/**
 * The catalog's `en` column doubles as the source snapshot: `getEmailT` falls back to
 * English whenever it stops matching the literal at the call site. That failure is
 * silent by design — a reviewed English sentence is the right thing to send — but it
 * would also silently un-translate a template that someone merely reworded, and
 * nobody reads their own outgoing mail in Macedonian to notice.
 *
 * So the snapshot is checked here instead: this scans the actual call sites and
 * fails the build on drift, which turns "quietly reverted to English" into "fix the
 * catalog before merging".
 */
const SENDER_FILES = [
  "src/lib/email/index.ts",
  "src/lib/auth.ts",
  "src/lib/services/account-deletion.service.ts",
];

/** Keys built at runtime from an enum or plural category (`email.case.status.${...}`)
 * never appear as a literal, so the unused-key check has to allow them. */
const DYNAMIC_KEY_PREFIXES = [
  "email.booking.guest_count.",
  "email.case.status.",
  "email.claim.response.",
  "email.claim.kind.",
];

interface CallSite {
  key: string;
  source: string;
  file: string;
}

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

function callSites(): CallSite[] {
  return SENDER_FILES.flatMap((file) => {
    const contents = readFileSync(join(process.cwd(), file), "utf8");
    return [...contents.matchAll(CALL_RE)].map((match) => ({
      key: match[2],
      source: unescape(match[4]),
      file,
    }));
  });
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe("email translation catalog", () => {
  const sites = callSites();

  it("finds the call sites it is meant to be checking", () => {
    // Guards the regex itself: a scanner that silently matches nothing would make
    // every assertion below pass while checking absolutely nothing.
    expect(sites.length).toBeGreaterThan(80);
  });

  it("has an entry for every translated string in the templates", () => {
    const missing = sites
      .filter((site) => !EMAIL_CATALOG[site.key])
      .map((site) => `${site.key} (${site.file})`);
    expect(missing).toEqual([]);
  });

  it("stores the exact English source used at each call site", () => {
    const drifted = sites
      .filter((site) => EMAIL_CATALOG[site.key])
      .filter((site) => EMAIL_CATALOG[site.key].en !== site.source)
      .map(
        (site) =>
          `${site.key}\n  call site: ${site.source}\n  catalog:   ${EMAIL_CATALOG[site.key].en}`,
      );
    expect(drifted).toEqual([]);
  });

  it("uses one source per key", () => {
    // The same key resolved against two different English sentences would leave one
    // of them permanently falling back, depending on which template ran.
    const byKey = new Map<string, Set<string>>();
    for (const site of sites) {
      const sources = byKey.get(site.key) ?? new Set<string>();
      sources.add(site.source);
      byKey.set(site.key, sources);
    }
    const conflicting = [...byKey.entries()]
      .filter(([, sources]) => sources.size > 1)
      .map(([key, sources]) => `${key}: ${[...sources].join(" | ")}`);
    expect(conflicting).toEqual([]);
  });

  it("has a non-empty translation in every supported locale", () => {
    const incomplete = Object.entries(EMAIL_CATALOG).flatMap(([key, entry]) =>
      EMAIL_LOCALES.filter((locale) => !entry[locale]?.trim()).map(
        (locale) => `${key} (${locale})`,
      ),
    );
    expect(incomplete).toEqual([]);
  });

  it("preserves every placeholder in translation", () => {
    // A dropped {deadline} or {reference} turns a booking email into one that is
    // grammatical, plausible, and missing the only fact the recipient needed.
    const broken = Object.entries(EMAIL_CATALOG).flatMap(([key, entry]) => {
      const expected = placeholders(entry.en);
      return EMAIL_LOCALES.filter(
        (locale) => placeholders(entry[locale]).join() !== expected.join(),
      ).map(
        (locale) =>
          `${key} (${locale}): expected {${expected.join("}, {")}}, got {${placeholders(
            entry[locale],
          ).join("}, {")}}`,
      );
    });
    expect(broken).toEqual([]);
  });

  it("has no entries the templates never ask for", () => {
    const used = new Set(sites.map((site) => site.key));
    const orphaned = Object.keys(EMAIL_CATALOG).filter(
      (key) =>
        !used.has(key) &&
        !DYNAMIC_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)),
    );
    expect(orphaned).toEqual([]);
  });
});

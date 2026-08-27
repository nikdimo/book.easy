import { describe, expect, it } from "vitest";
import catalog from "../generated-ui-strings.json";
import snapshot from "../reviewed-ai-translations.json";
import { REVIEWED_LANGUAGES } from "../reviewed-languages";

const PLACEHOLDER_RE = /\{[A-Za-z][A-Za-z0-9_]*\}/g;
const UNSUPPORTED_MESSAGE_FORMAT_RE =
  /\{[A-Za-z][A-Za-z0-9_]*\s*,\s*(?:plural|select|selectordinal)\b/i;

describe("reviewed AI translation snapshot", () => {
  it("fully covers the current catalog for every exported language", () => {
    const sourceByKey = new Map(catalog.map((entry) => [entry.key, entry.sourceText]));
    const sortedSourceKeys = [...sourceByKey.keys()].sort();
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.languages.map((language) => language.code)).toEqual(
      REVIEWED_LANGUAGES.map((language) => language.code)
    );
    expect(snapshot.languages.map((language) => language.name)).toEqual(
      REVIEWED_LANGUAGES.map((language) => language.nativeName)
    );
    expect(Object.keys(snapshot.catalog).sort()).toEqual(sortedSourceKeys);

    const sourceMismatches: string[] = [];
    for (const [key, source] of Object.entries(snapshot.catalog)) {
      if (source !== sourceByKey.get(key)) sourceMismatches.push(key);
    }
    expect(sourceMismatches, "source snapshot mismatches").toEqual([]);

    const emptyTranslations: string[] = [];
    const unsupportedMessages: string[] = [];
    const placeholderMismatches: string[] = [];
    for (const language of snapshot.languages) {
      expect(Object.keys(language.translations).sort(), `${language.code} keys`).toEqual(
        sortedSourceKeys
      );
      for (const [key, value] of Object.entries(language.translations)) {
        const label = `${language.code}:${key}`;
        if (!value.trim()) emptyTranslations.push(label);
        if (UNSUPPORTED_MESSAGE_FORMAT_RE.test(value)) unsupportedMessages.push(label);
        const expected = [...snapshot.catalog[key as keyof typeof snapshot.catalog].matchAll(PLACEHOLDER_RE)]
          .map((match) => match[0])
          .sort();
        const actual = [...value.matchAll(PLACEHOLDER_RE)]
          .map((match) => match[0])
          .sort();
        if (actual.join("\u0000") !== expected.join("\u0000")) {
          placeholderMismatches.push(label);
        }
      }
    }
    expect(emptyTranslations, "empty translations").toEqual([]);
    expect(unsupportedMessages, "unsupported ICU syntax").toEqual([]);
    expect(placeholderMismatches, "placeholder mismatches").toEqual([]);
  });
});

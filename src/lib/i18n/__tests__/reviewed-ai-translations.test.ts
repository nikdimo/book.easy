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
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.languages.map((language) => language.code)).toEqual(
      REVIEWED_LANGUAGES.map((language) => language.code)
    );
    expect(snapshot.languages.map((language) => language.name)).toEqual(
      REVIEWED_LANGUAGES.map((language) => language.nativeName)
    );
    expect(Object.keys(snapshot.catalog).sort()).toEqual([...sourceByKey.keys()].sort());

    for (const [key, source] of Object.entries(snapshot.catalog)) {
      expect(source, `${key} source snapshot`).toBe(sourceByKey.get(key));
    }
    for (const language of snapshot.languages) {
      expect(Object.keys(language.translations).sort(), `${language.code} keys`).toEqual(
        [...sourceByKey.keys()].sort()
      );
      for (const [key, value] of Object.entries(language.translations)) {
        expect(value.trim(), `${language.code}:${key}`).not.toBe("");
        expect(
          UNSUPPORTED_MESSAGE_FORMAT_RE.test(value),
          `${language.code}:${key} unsupported ICU syntax`,
        ).toBe(false);
        const expected = [...snapshot.catalog[key as keyof typeof snapshot.catalog].matchAll(PLACEHOLDER_RE)]
          .map((match) => match[0])
          .sort();
        const actual = [...value.matchAll(PLACEHOLDER_RE)]
          .map((match) => match[0])
          .sort();
        expect(actual, `${language.code}:${key} placeholders`).toEqual(expected);
      }
    }
  });
});

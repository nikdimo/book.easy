import { describe, expect, it } from "vitest";
import catalog from "../generated-ui-strings.json";
import { CURATED_TRANSLATION_OVERRIDES } from "../curated-overrides";

const PLACEHOLDER_RE = /\{[A-Za-z][A-Za-z0-9_]*\}/g;

describe("curated translation overrides", () => {
  it("references active keys and preserves source placeholders", () => {
    const sourceByKey = new Map(catalog.map((entry) => [entry.key, entry.sourceText]));
    for (const [key, translations] of Object.entries(CURATED_TRANSLATION_OVERRIDES)) {
      const source = sourceByKey.get(key);
      expect(source, `${key} must exist in the generated catalog`).toBeTypeOf("string");
      const expected = [...(source?.matchAll(PLACEHOLDER_RE) ?? [])].map((match) => match[0]).sort();
      for (const [locale, value] of Object.entries(translations)) {
        expect(value.trim(), `${locale}:${key} must not be empty`).not.toBe("");
        const actual = [...value.matchAll(PLACEHOLDER_RE)].map((match) => match[0]).sort();
        expect(actual, `${locale}:${key} placeholders`).toEqual(expected);
      }
    }
  });
});

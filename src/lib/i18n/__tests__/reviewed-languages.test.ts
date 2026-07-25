import { describe, expect, it } from "vitest";
import {
  REVIEWED_LANGUAGES,
  languageSearchScore,
  reviewedLanguageSearchText,
} from "../reviewed-languages";

describe("reviewed language manifest", () => {
  it("has unique language codes and unambiguous country mappings", () => {
    const codes = REVIEWED_LANGUAGES.map((language) => language.code);
    const countries = REVIEWED_LANGUAGES.flatMap((language) => language.primaryCountries);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(countries).size).toBe(countries.length);
  });

  it("indexes reviewed languages by English name and common Latin spellings", () => {
    const bulgarian = reviewedLanguageSearchText("bg").toLowerCase();
    expect(bulgarian).toContain("bulgarian");
    expect(bulgarian).toContain("bulgarski");
    expect(bulgarian).toContain("balgarski");
    expect(bulgarian).toContain("blgar");
  });

  it("matches normalized aliases without unrelated fuzzy results", () => {
    const bulgarian = reviewedLanguageSearchText("bg");
    expect(languageSearchScore(bulgarian, "bulgarian")).toBe(1);
    expect(languageSearchScore(bulgarian, "blgar")).toBe(1);
    expect(languageSearchScore("portugais Portuguese português pt", "blgar")).toBe(0);
    expect(languageSearchScore("ber (latin) Tamazight ber", "blgar")).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { getFallbackAutomaticLanguages } from "@/lib/i18n/google-translate-runtime";

describe("automatic language fallback catalog", () => {
  it("never exposes an untranslated implementation code as a language name", () => {
    const languages = getFallbackAutomaticLanguages("en");

    expect(languages.length).toBeGreaterThan(50);
    expect(languages.some((language) => language.code === "vi")).toBe(true);
    expect(
      languages.every(
        (language) =>
          language.name.trim().toLowerCase() !== language.code.toLowerCase() &&
          !language.name
            .trim()
            .toLocaleLowerCase()
            .startsWith(`${language.code.toLocaleLowerCase()} (`),
      ),
    ).toBe(true);
  });
});

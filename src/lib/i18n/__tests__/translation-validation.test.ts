import { describe, expect, it } from "vitest";
import { validateTranslationMap } from "../translation-validation";

describe("translation validation", () => {
  it("accepts the simple placeholders supported by runtime interpolation", () => {
    expect(
      validateTranslationMap(
        { baths: "{count} baths" },
        { baths: "Ванні кімнати: {count}" },
      ),
    ).toEqual({ baths: "Ванні кімнати: {count}" });
  });

  it("rejects ICU expressions that the UI would render as raw text", () => {
    expect(() =>
      validateTranslationMap(
        { baths: "{count} baths" },
        { baths: "{count} ванн{count, plural, one {} other {}}" },
      ),
    ).toThrow("unsupported ICU message syntax");
  });
});

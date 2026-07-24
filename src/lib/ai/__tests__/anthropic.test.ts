import { describe, expect, it } from "vitest";
import { validateTranslationResponse } from "@/lib/ai/anthropic";

describe("translation response validation", () => {
  it("accepts exact keys and preserved placeholders", () => {
    expect(
      validateTranslationResponse(
        { greeting: "Hosted by {name}" },
        '{"greeting":"Домаќин: {name}"}'
      )
    ).toEqual({ greeting: "Домаќин: {name}" });
  });

  it("rejects missing keys instead of storing English fallback text", () => {
    expect(() =>
      validateTranslationResponse({ one: "One", two: "Two" }, '{"one":"Еден"}')
    ).toThrow(/missing: two/);
  });

  it("rejects changed placeholders", () => {
    expect(() =>
      validateTranslationResponse(
        { greeting: "Hosted by {name}" },
        '{"greeting":"Домаќин: {име}"}'
      )
    ).toThrow(/preserve its placeholders/);
  });

  it("rejects extra keys and non-string values", () => {
    expect(() =>
      validateTranslationResponse({ one: "One" }, '{"one":"Еден","extra":"x"}')
    ).toThrow(/unexpected: extra/);
    expect(() => validateTranslationResponse({ one: "One" }, '{"one":1}')).toThrow(
      /non-empty string/
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  isDailyTranslationQuotaFailure,
  isPermanentTranslationApiFailure,
  shouldUseGeminiFallback,
} from "./translation-provider-fallback";

describe("translation provider fallback", () => {
  it.each([
    '401 {"error":{"type":"authentication_error","message":"API key is invalid."}}',
    "Anthropic authentication error",
    "Incorrect API key provided",
    "Unauthorized",
  ])("falls back to Gemini when Anthropic rejects authentication: %s", (message) => {
    expect(shouldUseGeminiFallback(new Error(message), "configured-google-key")).toBe(
      true,
    );
    expect(isPermanentTranslationApiFailure(new Error(message))).toBe(true);
  });

  it("does not claim a fallback is available without a Google key", () => {
    expect(shouldUseGeminiFallback(new Error("401 authentication_error"), "")).toBe(
      false,
    );
  });

  it.each(["credit balance is too low", "quota exceeded", "status 429", "503"])(
    "keeps the existing provider-unavailable fallback for %s",
    (message) => {
      expect(shouldUseGeminiFallback(new Error(message), "configured-google-key")).toBe(
        true,
      );
    },
  );

  it("does not hide an ordinary malformed-response error", () => {
    expect(
      shouldUseGeminiFallback(
        new Error("Translation response omitted a required locale"),
        "configured-google-key",
      ),
    ).toBe(false);
  });

  it("distinguishes Gemini's daily free-tier cap from a temporary minute limit", () => {
    expect(
      isDailyTranslationQuotaFailure(
        new Error(
          "quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier quotaValue: 20 retryDelay: 59s",
        ),
      ),
    ).toBe(true);
    expect(
      isDailyTranslationQuotaFailure(
        new Error("GenerateRequestsPerMinutePerProjectPerModel retryDelay: 59s"),
      ),
    ).toBe(false);
  });
});

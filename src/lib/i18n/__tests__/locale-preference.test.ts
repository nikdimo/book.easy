import { describe, expect, it } from "vitest";
import {
  googleTranslateCookieValue,
  localeFromCountry,
  localeFromGoogleTranslateCookie,
  normalizeLocaleCode,
  resolveLocalePreference,
} from "../locale-preference";

describe("locale preference", () => {
  it("normalizes safe Google locale codes and rejects cookie injection", () => {
    expect(normalizeLocaleCode("EN")).toBe("en");
    expect(normalizeLocaleCode("zh-cn")).toBe("zh-CN");
    expect(normalizeLocaleCode("en; Path=/")).toBeNull();
    expect(normalizeLocaleCode("")).toBeNull();
  });

  it("parses and creates automatic Google translation targets including English", () => {
    expect(localeFromGoogleTranslateCookie("/auto/en")).toBe("en");
    expect(localeFromGoogleTranslateCookie("/auto/zh-CN")).toBe("zh-CN");
    expect(localeFromGoogleTranslateCookie("en")).toBeNull();
    expect(googleTranslateCookieValue("en")).toBe("/auto/en");
  });

  it("uses an explicit selection before legacy Google state or geolocation", () => {
    expect(
      resolveLocalePreference({
        siteLocale: "en",
        googleTranslate: "/auto/mk",
        country: "FR",
      })
    ).toEqual({ locale: "en", source: "explicit" });
  });

  it("migrates a legacy Google selection before applying geolocation", () => {
    expect(
      resolveLocalePreference({
        googleTranslate: "/auto/sr",
        country: "FR",
      })
    ).toEqual({ locale: "sr", source: "legacy-google" });
  });

  it("defaults a first-time French visitor to reviewed French", () => {
    expect(localeFromCountry("fr")).toBe("fr");
    expect(resolveLocalePreference({ country: "FR" })).toEqual({
      locale: "fr",
      source: "country",
    });
  });

  it("keeps unmapped countries and unknown Cloudflare codes in English", () => {
    expect(localeFromCountry("DK")).toBeNull();
    expect(resolveLocalePreference({ country: "DK" })).toEqual({
      locale: "en",
      source: "default",
    });
    expect(resolveLocalePreference({ country: "XX" }).locale).toBe("en");
    expect(resolveLocalePreference({ country: "T1" }).locale).toBe("en");
  });
});

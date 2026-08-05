import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISPLAY_CURRENCY,
  currencyFromCountry,
  normalizeCurrencyCode,
  resolveCurrencyPreference,
} from "../currency-preference";

describe("display currency preference", () => {
  it("normalizes well-formed codes and rejects cookie injection", () => {
    expect(normalizeCurrencyCode("dkk")).toBe("DKK");
    expect(normalizeCurrencyCode(" mkd ")).toBe("MKD");
    expect(normalizeCurrencyCode("EUR; Path=/")).toBeNull();
    expect(normalizeCurrencyCode("EURO")).toBeNull();
    expect(normalizeCurrencyCode("")).toBeNull();
    expect(normalizeCurrencyCode(null)).toBeNull();
  });

  it("rejects a well-formed code the platform does not support", () => {
    // A stale cookie naming a dropped currency must fall through to the next
    // source, not reach Intl and throw on the next render.
    expect(normalizeCurrencyCode("ZZZ")).toBeNull();
    expect(
      resolveCurrencyPreference({ explicit: "ZZZ", country: "DK" }),
    ).toEqual({ currency: "DKK", source: "country" });
  });

  it("gives a first-time visitor the currency of their detected country", () => {
    expect(currencyFromCountry("dk")).toBe("DKK");
    expect(resolveCurrencyPreference({ country: "MK" })).toEqual({
      currency: "MKD",
      source: "country",
    });
    expect(resolveCurrencyPreference({ country: "JP" })).toEqual({
      currency: "JPY",
      source: "country",
    });
    expect(resolveCurrencyPreference({ country: "GR" })).toEqual({
      currency: "EUR",
      source: "country",
    });
  });

  it("lets a manual choice beat IP detection", () => {
    // The VPN and travelling-guest case: detection must not re-price the site for
    // someone who has already chosen.
    expect(
      resolveCurrencyPreference({ explicit: "MKD", country: "DK" }),
    ).toEqual({ currency: "MKD", source: "explicit" });
  });

  it("prefers the current visit's choice over the stored account preference", () => {
    // Someone who picks DKK and then signs in keeps DKK for this visit rather than
    // being reset to what the account remembered.
    expect(
      resolveCurrencyPreference({ explicit: "DKK", account: "USD", country: "MK" }),
    ).toEqual({ currency: "DKK", source: "explicit" });
  });

  it("applies the account preference on a browser with no choice yet", () => {
    expect(
      resolveCurrencyPreference({ account: "USD", country: "MK" }),
    ).toEqual({ currency: "USD", source: "account" });
  });

  it("lets an account preference override an automatically saved browser default", () => {
    expect(
      resolveCurrencyPreference({ browser: "DKK", account: "USD", country: "MK" }),
    ).toEqual({ currency: "USD", source: "account" });
  });

  it("keeps an automatically saved browser default when there is no account choice", () => {
    expect(
      resolveCurrencyPreference({ browser: "DKK", country: "MK" }),
    ).toEqual({ currency: "DKK", source: "browser" });
  });

  it("falls back to EUR for unmapped or unknown countries", () => {
    expect(currencyFromCountry("XX")).toBeNull();
    expect(resolveCurrencyPreference({ country: "XX" })).toEqual({
      currency: DEFAULT_DISPLAY_CURRENCY,
      source: "default",
    });
    expect(resolveCurrencyPreference({})).toEqual({
      currency: "EUR",
      source: "default",
    });
    // Cloudflare sends T1 for Tor exit nodes.
    expect(resolveCurrencyPreference({ country: "T1" }).currency).toBe("EUR");
  });
});

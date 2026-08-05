import { describe, expect, it } from "vitest";
import {
  COUNTRY_CURRENCY,
  CURRENCY_NAMES,
  currencyDecimals,
  currencyDisplayName,
  currencySearchScore,
  currencySearchText,
  currencySymbol,
  isSupportedCurrency,
} from "../currencies";

describe("currency catalog", () => {
  it("only maps countries to currencies the platform actually supports", () => {
    const unsupported = Object.entries(COUNTRY_CURRENCY).filter(
      ([, currency]) => !isSupportedCurrency(currency),
    );
    expect(unsupported).toEqual([]);
  });

  it("keys countries by ISO 3166-1 alpha-2, matching the cf-ipcountry header", () => {
    const malformed = Object.keys(COUNTRY_CURRENCY).filter(
      (country) => !/^[A-Z]{2}$/.test(country),
    );
    expect(malformed).toEqual([]);
  });

  it("maps the story's example countries to their local currency", () => {
    expect(COUNTRY_CURRENCY.DK).toBe("DKK");
    expect(COUNTRY_CURRENCY.MK).toBe("MKD");
    expect(COUNTRY_CURRENCY.SE).toBe("SEK");
    expect(COUNTRY_CURRENCY.GB).toBe("GBP");
    expect(COUNTRY_CURRENCY.US).toBe("USD");
    expect(COUNTRY_CURRENCY.JP).toBe("JPY");
  });

  it("keeps eurozone countries on EUR even when they share a language with others", () => {
    // Greece speaks Greek and prices in EUR; Austria and Germany share both; the
    // Swiss share German but not the currency. Deriving currency from the language
    // list would get Switzerland wrong.
    expect(COUNTRY_CURRENCY.GR).toBe("EUR");
    expect(COUNTRY_CURRENCY.AT).toBe("EUR");
    expect(COUNTRY_CURRENCY.DE).toBe("EUR");
    expect(COUNTRY_CURRENCY.CH).toBe("CHF");
  });

  it("reads decimal places from Intl rather than assuming two", () => {
    expect(currencyDecimals("EUR")).toBe(2);
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("KWD")).toBe(3);
  });

  it("never renders a currency's name as its own bare code", () => {
    for (const code of Object.keys(CURRENCY_NAMES)) {
      expect(currencyDisplayName(code, "en")).not.toBe(code);
    }
  });

  it("degrades to the bare code rather than throwing on unknown input", () => {
    // An unknown ISO code reaches Intl from stored data (an old cookie, a currency
    // the provider dropped), and every one of these throws rather than returning a
    // placeholder. A picker row must never crash the header.
    expect(currencyDisplayName("ZZZ", "en")).toBe("ZZZ");
    expect(currencySymbol("ZZZ", "en")).toBe("ZZZ");
    expect(currencyDecimals("ZZZ")).toBe(2);
  });

  it("indexes a currency by code, name, symbol and country name", () => {
    const dkk = currencySearchText("DKK", "en");
    expect(currencySearchScore(dkk, "DKK")).toBe(1);
    expect(currencySearchScore(dkk, "danish krone")).toBe(1);
    expect(currencySearchScore(dkk, "Denmark")).toBe(1);
    expect(currencySearchScore(dkk, "yen")).toBe(0);
  });

  it("finds a currency by country name in the language being read", () => {
    // The spec asks for search by country name; a visitor reading Macedonian must
    // still be able to type the Macedonian name of the country.
    const mkd = currencySearchText("MKD", "mk");
    expect(currencySearchScore(mkd, "Македонија")).toBe(1);
  });

  it("matches diacritics and case insensitively", () => {
    const isk = currencySearchText("ISK", "en");
    expect(currencySearchScore(isk, "krona")).toBe(1);
    expect(currencySearchScore(isk, "ICELANDIC")).toBe(1);
  });

  it("requires every query token to match, unlike a fuzzy matcher", () => {
    const sek = currencySearchText("SEK", "en");
    expect(currencySearchScore(sek, "swedish krona")).toBe(1);
    expect(currencySearchScore(sek, "swedish yen")).toBe(0);
    expect(currencySearchScore(sek, "")).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { convertAmount, displayPrice, formatMoney } from "../convert";

/** Intl separates symbol from number with U+00A0, not a plain space. Spelling it
 *  out keeps these assertions from looking like they have a stray space in them. */
const NB = " ";

const RATES = {
  EUR: 1,
  DKK: 7.46,
  MKD: 61.5,
  USD: 1.09,
  JPY: 170,
  GBP: 0.85,
};

const context = (display: string) => ({ display, rates: RATES });

describe("currency conversion", () => {
  it("converts through the base currency in both directions", () => {
    expect(convertAmount(100, "EUR", context("DKK"))).toBeCloseTo(746, 6);
    expect(convertAmount(746, "DKK", context("EUR"))).toBeCloseTo(100, 6);
    // A listing priced in a non-base currency still converts correctly.
    expect(convertAmount(61.5, "MKD", context("DKK"))).toBeCloseTo(7.46, 6);
  });

  it("is a no-op when official and display currency match", () => {
    expect(convertAmount(100, "EUR", context("EUR"))).toBe(100);
  });

  it("returns null rather than a guess when either leg is unquotable", () => {
    expect(convertAmount(100, "EUR", context("ZZZ"))).toBeNull();
    expect(convertAmount(100, "ZZZ", context("DKK"))).toBeNull();
    expect(convertAmount(Number.NaN, "EUR", context("DKK"))).toBeNull();
    // A zero or negative rate would render a listing as free.
    expect(convertAmount(100, "EUR", { display: "DKK", rates: { EUR: 1, DKK: 0 } })).toBeNull();
  });
});

describe("money formatting", () => {
  it("follows the reading locale's separators and symbol position", () => {
    expect(formatMoney(1250, "EUR", "en")).toBe("€1,250.00");
    expect(formatMoney(1250, "EUR", "de")).toBe(`1.250,00${NB}€`);
  });

  it("omits decimals for currencies that have no minor unit", () => {
    expect(formatMoney(150000, "JPY", "en")).toBe("¥150,000");
  });

  it("drops cents on converted amounts above ten units", () => {
    // A converted price is an approximation; cents imply precision it lacks and
    // make a grid of prices harder to scan.
    expect(formatMoney(3945.87, "DKK", "en", { converted: true })).toBe(`kr${NB}3,946`);
    expect(formatMoney(2768.43, "MKD", "en", { converted: true })).toBe(`MKD${NB}2,768`);
  });

  it("names a currency the way the reading locale does", () => {
    // English has no short symbol for the denar so Intl uses the code, while a
    // visitor reading Macedonian gets "ден". Neither is hardcoded anywhere.
    expect(formatMoney(2768, "MKD", "mk", { converted: true })).toContain("ден");
  });

  it("keeps cents on small converted amounts where they still matter", () => {
    // Rounding a €2 fee to $2 loses a tenth of it.
    expect(formatMoney(2.18, "USD", "en", { converted: true })).toBe("$2.18");
  });

  it("keeps full precision on official amounts, which someone actually owes", () => {
    expect(formatMoney(500.5, "EUR", "en")).toBe("€500.50");
    expect(formatMoney(500.5, "EUR", "en", { converted: true })).toBe("€501");
  });

  it("can render the code where a bare symbol would be ambiguous", () => {
    // AUD, CAD, USD and several others all narrow to "$".
    expect(formatMoney(100, "AUD", "en", { showCode: true })).toContain("AUD");
  });

  it("never blanks a price out on input Intl refuses", () => {
    // Intl tolerates any three-letter code, so the throwing path needs a
    // structurally invalid one to reach it.
    expect(formatMoney(100, "E", "en")).toBe("100.00 E");
  });
});

describe("displayPrice", () => {
  it("converts and marks the result as converted", () => {
    expect(displayPrice(100, "EUR", "en", context("DKK"))).toEqual({
      text: `kr${NB}746`,
      currency: "DKK",
      converted: true,
    });
  });

  it("falls back to the official currency when rates are unavailable", () => {
    // The story's explicit requirement: show the official price, never a broken,
    // zero or invented one.
    expect(displayPrice(100, "EUR", "en", null)).toEqual({
      text: "€100.00",
      currency: "EUR",
      converted: false,
    });
    expect(displayPrice(100, "EUR", "en", context("ZZZ"))).toEqual({
      text: "€100.00",
      currency: "EUR",
      converted: false,
    });
  });

  it("reports no conversion when the guest already browses in the official currency", () => {
    expect(displayPrice(100, "EUR", "en", context("EUR")).converted).toBe(false);
  });
});

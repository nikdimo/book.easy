import { describe, expect, it } from "vitest";
import {
  convertDraftAmount,
  convertPriceStepAmounts,
  currencyAdjustedMaximum,
  draftCurrencyOffer,
} from "@/lib/host/v2/draft-currency";
import {
  CLEANING_FEE_MAX,
  NIGHTLY_PRICE_MAX,
  NIGHTLY_PRICE_MIN,
} from "@/lib/host/v2/listing-nightly-price";

/** Base-quoted, exactly as the provider returns them: one euro buys 7.46 kroner. */
const RATES = { EUR: 1, DKK: 7.46, USD: 1.08 } as const;

describe("draftCurrencyOffer", () => {
  it("offers nothing when the listing is already in the host's currency", () => {
    expect(draftCurrencyOffer("EUR", "EUR", RATES)).toBe("none");
  });

  it("offers a conversion when both currencies are quotable", () => {
    expect(draftCurrencyOffer("EUR", "DKK", RATES)).toBe("convert");
  });

  it("offers to clear instead when the rates are unavailable", () => {
    expect(draftCurrencyOffer("EUR", "DKK", null)).toBe("clear");
  });

  it("offers to clear when only one leg is quotable", () => {
    expect(draftCurrencyOffer("MKD", "DKK", RATES)).toBe("clear");
  });
});

describe("convertDraftAmount", () => {
  it("moves the amount with the label rather than renaming it", () => {
    // The whole point: 100 EUR does not become 100 DKK.
    expect(convertDraftAmount("100", "EUR", "DKK", RATES)).toBe("746");
  });

  it("converts back symmetrically", () => {
    expect(convertDraftAmount("746", "DKK", "EUR", RATES)).toBe("100");
  });

  it("keeps an empty amount empty rather than inventing a zero", () => {
    expect(convertDraftAmount("", "EUR", "DKK", RATES)).toBe("");
  });

  it("returns null when there is no rate to convert with", () => {
    expect(convertDraftAmount("100", "EUR", "DKK", null)).toBeNull();
    expect(convertDraftAmount("100", "MKD", "DKK", RATES)).toBeNull();
  });

  it("refuses a conversion that would exceed a supplied field bound", () => {
    expect(
      convertDraftAmount(String(NIGHTLY_PRICE_MAX), "EUR", "DKK", RATES, {
        min: NIGHTLY_PRICE_MIN,
        max: NIGHTLY_PRICE_MAX,
      }),
    ).toBeNull();
  });
});

describe("currencyAdjustedMaximum", () => {
  it("keeps the reference guard in EUR and converts it for DKK", () => {
    expect(currencyAdjustedMaximum(CLEANING_FEE_MAX, "EUR", RATES)).toBe(1000);
    expect(currencyAdjustedMaximum(CLEANING_FEE_MAX, "DKK", RATES)).toBe(7460);
  });

  it("does not apply a EUR-sized cap to another currency when rates are unavailable", () => {
    expect(currencyAdjustedMaximum(CLEANING_FEE_MAX, "MKD", null)).toBeGreaterThan(1000);
  });
});

describe("convertPriceStepAmounts", () => {
  it("converts the nightly price and the cleaning fee together", () => {
    expect(
      convertPriceStepAmounts({ price: "100", cleaningFee: "20" }, "EUR", "DKK", RATES),
    ).toEqual({ price: "746", cleaningFee: "149" });
  });

  it("converts the fee against a currency-adjusted ceiling", () => {
    expect(
      convertPriceStepAmounts({ price: "100", cleaningFee: "500" }, "EUR", "DKK", RATES),
    ).toEqual({ price: "746", cleaningFee: "3730" });
  });

  it("refuses a half-conversion — either both amounts move or neither does", () => {
    expect(
      convertPriceStepAmounts({ price: "100", cleaningFee: "20" }, "MKD", "DKK", RATES),
    ).toBeNull();
  });
});

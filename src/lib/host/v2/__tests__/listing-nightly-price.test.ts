import { describe, expect, it } from "vitest";
import {
  CLEANING_FEE_MAX,
  CLEANING_FEE_MIN,
  EXAMPLE_STAY_NIGHTS,
  NIGHTLY_PRICE_MAX,
  NIGHTLY_PRICE_MIN,
  NIGHTLY_PRICE_STEP,
  canStepNightlyPrice,
  cleaningFeeIssue,
  exampleStayTotal,
  nightlyPriceComplete,
  nightlyPriceIssue,
  parseCleaningFee,
  parseNightlyPrice,
  sanitizeCleaningFeeInput,
  sanitizeNightlyPriceInput,
  stepNightlyPrice,
} from "@/lib/host/v2/listing-nightly-price";

describe("sanitizeNightlyPriceInput", () => {
  it("keeps a plain amount untouched", () => {
    expect(sanitizeNightlyPriceInput("120")).toBe("120");
  });

  it("drops everything that is not a digit", () => {
    expect(sanitizeNightlyPriceInput("€1 200,50")).toBe("120050");
    expect(sanitizeNightlyPriceInput("-45")).toBe("45");
    expect(sanitizeNightlyPriceInput("abc")).toBe("");
  });

  it("strips a leading zero left behind by typing over the starting amount", () => {
    expect(sanitizeNightlyPriceInput("060")).toBe("60");
  });

  it("keeps a lone zero, so clearing the field reaches the too-low message", () => {
    expect(sanitizeNightlyPriceInput("0")).toBe("0");
    expect(sanitizeNightlyPriceInput("000")).toBe("0");
  });

  it("permits the storage precision needed by low-value currencies", () => {
    expect(sanitizeNightlyPriceInput("123456789012")).toBe("12345678901");
  });
});

describe("parseNightlyPrice", () => {
  it("reads whole currency units", () => {
    expect(parseNightlyPrice("90")).toBe(90);
  });

  it("is null when the field holds no number at all", () => {
    expect(parseNightlyPrice("")).toBeNull();
    expect(parseNightlyPrice("   ")).toBeNull();
  });
});

describe("nightlyPriceIssue", () => {
  it("accepts an ordinary nightly rate", () => {
    expect(nightlyPriceIssue("75")).toBeUndefined();
    expect(nightlyPriceComplete("75")).toBe(true);
  });

  it("reports an empty field", () => {
    expect(nightlyPriceIssue("")).toBe("EMPTY");
    expect(nightlyPriceComplete("")).toBe(false);
  });

  it("holds the floor the pricing service enforces", () => {
    expect(NIGHTLY_PRICE_MIN).toBe(1);
    expect(nightlyPriceIssue("0")).toBe("TOO_LOW");
    expect(nightlyPriceIssue(String(NIGHTLY_PRICE_MIN))).toBeUndefined();
  });

  it("guards against a slipped key above the ceiling", () => {
    expect(nightlyPriceIssue(String(NIGHTLY_PRICE_MAX))).toBeUndefined();
    expect(nightlyPriceIssue(String(NIGHTLY_PRICE_MAX + 1))).toBe("TOO_HIGH");
  });
});

describe("the cleaning fee", () => {
  it("treats an empty field as no fee, not as an unanswered question", () => {
    expect(parseCleaningFee("")).toBe(CLEANING_FEE_MIN);
    expect(cleaningFeeIssue("")).toBeUndefined();
  });

  it("accepts whole currency units only", () => {
    expect(sanitizeCleaningFeeInput("1 2,5€")).toBe("125");
    expect(sanitizeCleaningFeeInput("-15")).toBe("15");
    expect(sanitizeCleaningFeeInput("015")).toBe("15");
  });

  it("accepts anything up to the UI ceiling", () => {
    expect(cleaningFeeIssue(String(CLEANING_FEE_MAX))).toBeUndefined();
  });

  it("catches a slipped key above the ceiling, while leaving it typable", () => {
    expect(cleaningFeeIssue(String(CLEANING_FEE_MAX + 1))).toBe("TOO_HIGH");
    expect(cleaningFeeIssue("9999")).toBe("TOO_HIGH");
  });

  it("accepts a currency-adjusted ceiling supplied by the screen", () => {
    expect(cleaningFeeIssue("7460", 7460)).toBeUndefined();
    expect(cleaningFeeIssue("7461", 7460)).toBe("TOO_HIGH");
  });
});

describe("the nightly price stepper", () => {
  it("moves by five", () => {
    expect(stepNightlyPrice("60", 1)).toBe("65");
    expect(stepNightlyPrice("60", -1)).toBe("55");
    expect(NIGHTLY_PRICE_STEP).toBe(5);
  });

  it("steps up from an empty field rather than refusing to move", () => {
    expect(stepNightlyPrice("", 1)).toBe(String(NIGHTLY_PRICE_STEP));
  });

  it("never steps outside the bounds the field itself enforces", () => {
    expect(stepNightlyPrice("2", -1)).toBe(String(NIGHTLY_PRICE_MIN));
    expect(stepNightlyPrice(String(NIGHTLY_PRICE_MAX), 1)).toBe(String(NIGHTLY_PRICE_MAX));
    expect(nightlyPriceIssue(stepNightlyPrice("2", -1))).toBeUndefined();
    expect(nightlyPriceIssue(stepNightlyPrice(String(NIGHTLY_PRICE_MAX), 1))).toBeUndefined();
  });

  it("reports when a tap would do nothing, so the control can be disabled", () => {
    expect(canStepNightlyPrice(String(NIGHTLY_PRICE_MAX), 1)).toBe(false);
    expect(canStepNightlyPrice(String(NIGHTLY_PRICE_MIN), -1)).toBe(false);
    expect(canStepNightlyPrice("60", 1)).toBe(true);
    expect(canStepNightlyPrice("60", -1)).toBe(true);
  });
});

describe("the example stay", () => {
  it("charges the nightly rate per night and the fee exactly once", () => {
    expect(exampleStayTotal("60", "15")).toBe(60 * EXAMPLE_STAY_NIGHTS + 15);
  });

  it("is just the nights when there is no cleaning fee", () => {
    expect(exampleStayTotal("60", "")).toBe(60 * EXAMPLE_STAY_NIGHTS);
  });

  it("shows nothing at all when there is no price to work from", () => {
    // Otherwise the line would price a stay at the cleaning fee alone.
    expect(exampleStayTotal("", "15")).toBeNull();
  });
});

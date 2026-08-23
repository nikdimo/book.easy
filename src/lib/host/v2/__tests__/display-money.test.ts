import { describe, expect, it } from "vitest";
import {
  buildCalendarFormats,
  formatDisplayMoney,
  formatMoney,
  toDisplayAmount,
} from "@/lib/host/v2/calendar-format";

/** Base-quoted, exactly as the provider returns them. */
const RATES = { EUR: 1, DKK: 7.46, USD: 1.08 };

const withDisplay = (currency: string) =>
  buildCalendarFormats("en", ["EUR", "USD"], { currency, rates: RATES });
const withoutDisplay = buildCalendarFormats("en", ["EUR", "USD"]);

/**
 * Host-panel amounts are read-only, so they are shown in the currency the host chose
 * to read prices in. What they are *paid* stays available beside them, because a
 * converted figure is today's approximation and a payout is not.
 */
describe("formatDisplayMoney", () => {
  it("shows a foreign-priced booking in the host's own currency", () => {
    const shown = formatDisplayMoney(100, "EUR", withDisplay("DKK"));

    expect(shown.converted).toBe(true);
    expect(shown.currency).toBe("DKK");
    expect(shown.text).toContain("746");
  });

  it("keeps the official amount alongside the converted one", () => {
    const shown = formatDisplayMoney(100, "EUR", withDisplay("DKK"));

    expect(shown.official).toBe(formatMoney(100, "EUR", withDisplay("DKK")));
  });

  it("converts nothing when the two currencies already agree", () => {
    const shown = formatDisplayMoney(100, "EUR", withDisplay("EUR"));

    expect(shown.converted).toBe(false);
    expect(shown.text).toBe(shown.official);
  });

  it("falls back to the official amount when rates are unavailable", () => {
    const shown = formatDisplayMoney(100, "EUR", withoutDisplay);

    expect(shown.converted).toBe(false);
    expect(shown.text).toBe(formatMoney(100, "EUR", withoutDisplay));
  });

  it("falls back rather than guessing when one leg is unquotable", () => {
    const shown = formatDisplayMoney(100, "MKD", withDisplay("DKK"));

    expect(shown.converted).toBe(false);
    expect(shown.currency).toBe("MKD");
  });

  it("carries a pattern for the display currency even when nothing is priced in it", () => {
    // Without this the converted amount renders as a bare "746.00 DKK".
    expect(withDisplay("DKK").money.DKK).toBeDefined();
  });
});

describe("toDisplayAmount", () => {
  it("returns a number that can be added to other converted numbers", () => {
    const converted = toDisplayAmount(100, "EUR", withDisplay("DKK"));

    expect(converted.currency).toBe("DKK");
    expect(converted.amount).toBeCloseTo(746, 5);
  });

  it("leaves an unconvertible amount in its own currency, and says so", () => {
    const converted = toDisplayAmount(100, "MKD", withDisplay("DKK"));

    expect(converted).toMatchObject({ amount: 100, currency: "MKD", converted: false });
  });
});

import { describe, expect, it } from "vitest";
import { summarizeUpcomingTotal } from "@/lib/host/upcoming-booking-total";
import type { ConversionContext } from "@/lib/currency/convert";

describe("summarizeUpcomingTotal", () => {
  it("sums plainly when every upcoming booking is already in the display currency", () => {
    const summary = summarizeUpcomingTotal(
      [
        { currency: "EUR", amount: 100 },
        { currency: "EUR", amount: 50 },
      ],
      "EUR",
      "en",
      null,
    );

    expect(summary.approximate).toBe(false);
    expect(summary.text).toBe("€150");
  });

  it("converts even when all bookings share a currency different from the host's selection", () => {
    const context: ConversionContext = {
      display: "DKK",
      rates: { EUR: 1, DKK: 7.46 },
    };
    const summary = summarizeUpcomingTotal(
      [
        { currency: "EUR", amount: 100 },
        { currency: "EUR", amount: 50 },
      ],
      "DKK",
      "da",
      context,
    );

    expect(summary.approximate).toBe(true);
    expect(summary.text).toContain("1.119");
    expect(summary.text).toContain("kr.");
    expect(summary.text).not.toContain("€");
  });

  it("converts a mix of currencies into the host's display currency when rates allow it", () => {
    const context: ConversionContext = {
      display: "EUR",
      rates: { EUR: 1, USD: 1.1 },
    };
    // €100 official + $110 official, which is exactly €100 at this rate.
    const summary = summarizeUpcomingTotal(
      [
        { currency: "EUR", amount: 100 },
        { currency: "USD", amount: 110 },
      ],
      "EUR",
      "en",
      context,
    );

    expect(summary.approximate).toBe(true);
    expect(summary.text).toBe("€200");
  });

  it("never adds raw amounts from different currencies together", () => {
    // Regression guard: a host with one €500 and one $200 upcoming booking must
    // never see something like "€700" — that number would mean nothing.
    const context: ConversionContext = {
      display: "EUR",
      rates: { EUR: 1, USD: 1.1 },
    };
    const summary = summarizeUpcomingTotal(
      [
        { currency: "EUR", amount: 500 },
        { currency: "USD", amount: 200 },
      ],
      "EUR",
      "en",
      context,
    );

    expect(summary.text).not.toContain("700");
  });

  it("falls back to a per-currency breakdown when conversion is unavailable", () => {
    // No rate table at all (provider down, or nothing cached yet).
    const summary = summarizeUpcomingTotal(
      [
        { currency: "EUR", amount: 500 },
        { currency: "USD", amount: 200 },
      ],
      "EUR",
      "en",
      null,
    );

    expect(summary.approximate).toBe(false);
    expect(summary.text).toContain("€500");
    expect(summary.text).toContain("$200");
    expect(summary.text).not.toContain("700");
  });

  it("falls back to a per-currency breakdown when the rate table cannot quote one of the currencies", () => {
    const context: ConversionContext = {
      display: "EUR",
      // No USD entry: the booking in USD is unquotable against this table.
      rates: { EUR: 1 },
    };
    const summary = summarizeUpcomingTotal(
      [
        { currency: "EUR", amount: 500 },
        { currency: "USD", amount: 200 },
      ],
      "EUR",
      "en",
      context,
    );

    expect(summary.approximate).toBe(false);
    expect(summary.text).toContain("€500");
    expect(summary.text).toContain("$200");
  });

  it("returns a zero total in the fallback currency when there are no upcoming bookings", () => {
    const summary = summarizeUpcomingTotal([], "MKD", "en", null);

    expect(summary.approximate).toBe(false);
    expect(summary.text).toMatch(/0/);
  });
});

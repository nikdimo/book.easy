import { describe, expect, it } from "vitest";
import { formatDate, formatPrice } from "@/lib/utils/format";

describe("formatPrice", () => {
  it("formats a non-EUR currency in the booking's own official currency, not EUR", () => {
    // Regression guard for the after-stay bug: a price rendered with only an amount
    // (no currency argument) silently defaulted to EUR regardless of what the
    // booking was actually priced in.
    const usd = formatPrice(115, "USD");
    expect(usd).not.toContain("€");
    expect(usd).toMatch(/\$|USD/);
  });

  it("uses the reading locale's own separators and symbol placement", () => {
    const enUsd = formatPrice(1250, "USD", "en");
    const deEur = formatPrice(1250, "EUR", "de");
    const mkMkd = formatPrice(1250, "MKD", "mk");

    // English groups with a comma; German groups with a period and trails the symbol.
    expect(enUsd).toContain(",");
    expect(deEur).toContain("1.250");
    // Macedonian must not silently fall back to the English "$1,250" shape.
    expect(mkMkd).not.toBe(enUsd);
  });
});

describe("formatDate", () => {
  it("renders the same instant differently per reading locale", () => {
    const date = new Date("2026-03-05T00:00:00.000Z");
    const en = formatDate(date, "en");
    const de = formatDate(date, "de");
    const mk = formatDate(date, "mk");

    expect(en).not.toBe(de);
    expect(en).not.toBe(mk);
  });
});

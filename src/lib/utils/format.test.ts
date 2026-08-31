import { describe, expect, it } from "vitest";
import {
  formatCalendarDate,
  formatCalendarDateShort,
  formatDate,
  formatPrice,
} from "@/lib/utils/format";

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

describe("calendar-date formatting", () => {
  it("keeps a stored booking day unchanged in every process time zone", () => {
    const previous = process.env.TZ;
    try {
      const answers = [
        "UTC",
        "Europe/Skopje",
        "America/Chicago",
        "Pacific/Kiritimati",
      ].map((zone) => {
        process.env.TZ = zone;
        return {
          full: formatCalendarDate(new Date("2026-06-10T00:00:00.000Z"), "en"),
          short: formatCalendarDateShort("2026-06-10", "en"),
        };
      });

      expect(new Set(answers.map((answer) => answer.full)).size).toBe(1);
      expect(new Set(answers.map((answer) => answer.short)).size).toBe(1);
      expect(answers[0].full).toContain("10");
      expect(answers[0].short).toContain("10");
    } finally {
      process.env.TZ = previous;
    }
  });
});

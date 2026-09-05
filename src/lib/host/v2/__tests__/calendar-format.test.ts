import { describe, expect, it } from "vitest";
import {
  buildCalendarFormats,
  formatLongDate,
  formatMonthYear,
  formatMoney,
  formatShortDate,
  formatWeekdayShortDate,
  weekdayLabels,
} from "@/lib/host/v2/calendar-format";

/**
 * These tests are the guard on the hydration bug.
 *
 * The failure was not that some locale formatted badly — it was that the *same* locale
 * formatted differently in Node and in the browser, because the browser had no data for
 * it. So the thing worth testing is that the snapshot reproduces what `Intl` produced
 * on the server, using nothing but the snapshot itself.
 */
describe("buildCalendarFormats", () => {
  it.each(["en", "mk", "de", "fr"])(
    "reproduces Intl's own currency output for %s",
    (locale) => {
      const formats = buildCalendarFormats(locale, ["EUR"]);
      const intl = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "EUR",
        currencyDisplay: "narrowSymbol",
      });
      for (const amount of [0, 7.5, 120, 1234.56, 1234567.89]) {
        expect(formatMoney(amount, "EUR", formats)).toBe(intl.format(amount));
      }
    },
  );

  /**
   * Compared against `formatToParts`, not `format`.
   *
   * ICU does not always agree with itself: for `mk`, `formatToParts` emits a narrow
   * no-break space (U+202F) between the year and its "г." suffix where `format`
   * emits an ordinary space. The snapshot is built from the parts, so it inherits the
   * narrow space — which is the better typography anyway, since it stops the suffix
   * wrapping onto its own line. It is invisible either way, and, crucially, both the
   * server and the client now render from the same snapshot rather than from either
   * ICU API, so they cannot disagree.
   */
  function joinParts(
    locale: string,
    options: Intl.DateTimeFormatOptions,
    date: Date,
  ): string {
    return new Intl.DateTimeFormat(locale, options)
      .formatToParts(date)
      .map((part) => part.value)
      .join("");
  }

  it("reproduces Intl's own date output for a locale with its own patterns", () => {
    const formats = buildCalendarFormats("mk", ["EUR"]);
    for (const ymd of ["2026-01-01", "2026-03-09", "2026-08-31", "2026-12-25"]) {
      const [y, m, d] = ymd.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      expect(formatLongDate(ymd, formats)).toBe(
        joinParts("mk", { day: "numeric", month: "long", year: "numeric" }, date),
      );
      expect(formatMonthYear(ymd, formats)).toBe(
        joinParts("mk", { month: "long", year: "numeric" }, date),
      );
    }
  });

  it("reproduces short dates too", () => {
    const formats = buildCalendarFormats("en", ["EUR"]);
    expect(formatShortDate("2026-08-03", formats)).toBe(
      joinParts("en", { day: "numeric", month: "short" }, new Date(2026, 7, 3)),
    );
  });

  it("reproduces weekday-and-date labels without using browser ICU", () => {
    const formats = buildCalendarFormats("mk", ["EUR"]);
    const date = new Date(2026, 8, 11);
    expect(formatWeekdayShortDate("2026-09-11", formats)).toBe(
      joinParts(
        "mk",
        { weekday: "short", day: "numeric", month: "short" },
        date,
      ),
    );
  });

  it("renders the same string for every date, not only the probe date", () => {
    // The snapshot captures one date's field order and literals and reuses them, so
    // a locale whose pattern varied by month would silently drift. Nothing in CLDR
    // does that, and this is the test that would notice if it did.
    const formats = buildCalendarFormats("mk", ["EUR"]);
    for (let month = 0; month < 12; month += 1) {
      const date = new Date(2026, month, 15);
      const ymd = `2026-${String(month + 1).padStart(2, "0")}-15`;
      expect(formatLongDate(ymd, formats)).toBe(
        joinParts("mk", { day: "numeric", month: "long", year: "numeric" }, date),
      );
    }
  });

  it("starts the weekday names on Monday, matching the grid", () => {
    const formats = buildCalendarFormats("en", ["EUR"]);
    const labels = weekdayLabels(formats);
    expect(labels).toHaveLength(7);
    expect(labels[0]).toBe(
      new Intl.DateTimeFormat("en", { weekday: "short" }).format(
        new Date(2026, 10, 23),
      ),
    );
  });

  it("carries a pattern for every currency the workspace was given", () => {
    const formats = buildCalendarFormats("en", ["EUR", "MKD", "EUR"]);
    expect(Object.keys(formats.money).sort()).toEqual(["EUR", "MKD"]);
  });

  it("handles negative amounts through the locale's own minus sign", () => {
    const formats = buildCalendarFormats("en", ["EUR"]);
    expect(formatMoney(-42, "EUR", formats)).toBe(
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: "EUR",
        currencyDisplay: "narrowSymbol",
      }).format(-42),
    );
  });

  it("falls back visibly rather than borrowing another currency's symbol", () => {
    const formats = buildCalendarFormats("en", ["EUR"]);
    expect(formatMoney(10, "GBP", formats)).toBe("10.00 GBP");
  });

  it("is plain JSON, so it survives the server-to-client boundary unchanged", () => {
    const formats = buildCalendarFormats("mk", ["EUR"]);
    const roundTripped = JSON.parse(JSON.stringify(formats));
    expect(formatMoney(120, "EUR", roundTripped)).toBe(
      formatMoney(120, "EUR", formats),
    );
    expect(formatLongDate("2026-03-09", roundTripped)).toBe(
      formatLongDate("2026-03-09", formats),
    );
  });
});

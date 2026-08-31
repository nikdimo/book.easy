import { describe, expect, it } from "vitest";
import type { ConversionContext } from "@/lib/currency/convert";
import {
  bandMatchesBounds,
  comparePriceCandidates,
  convertPriceBand,
  hasPriceBounds,
  normalizePriceBounds,
  orderPriceCandidates,
  type PriceCandidate,
} from "@/lib/search/price-comparison";

/**
 * Rates are base-quoted multipliers, exactly as `getExchangeRates` returns them: one
 * euro buys 61.5 denars, 0.85 pounds, 7.46 kroner. Approximately real, and picked so
 * the equivalence assertions below are exact rather than nearly.
 */
const RATES = { EUR: 1, MKD: 61.5, GBP: 0.85, DKK: 7.46 } as const;

function eurContext(rates: Record<string, number> = RATES): ConversionContext {
  return { display: "EUR", rates };
}

const eur = (low: number, high = low) => ({ currency: "EUR", low, high });
const mkd = (low: number, high = low) => ({ currency: "MKD", low, high });
const gbp = (low: number, high = low) => ({ currency: "GBP", low, high });

describe("normalizePriceBounds", () => {
  it("keeps a zero maximum, which is a filter, and drops a zero minimum, which is not", () => {
    // The truthiness test this replaces dropped both. A zero upper bound genuinely
    // means "nothing above free"; a zero lower bound excludes nothing at all.
    expect(normalizePriceBounds(0, 0)).toEqual({ min: null, max: 0 });
    expect(normalizePriceBounds(0, undefined)).toEqual({ min: null, max: null });
  });

  it("treats a missing, null or unparseable bound as no bound", () => {
    expect(normalizePriceBounds(undefined, undefined)).toEqual({
      min: null,
      max: null,
    });
    expect(normalizePriceBounds(null, null)).toEqual({ min: null, max: null });
    expect(normalizePriceBounds(Number.NaN, Number.NaN)).toEqual({
      min: null,
      max: null,
    });
    expect(normalizePriceBounds(Number.POSITIVE_INFINITY, 100)).toEqual({
      min: null,
      max: 100,
    });
  });

  it("drops an inverted band entirely, matching what the slider resets itself to", () => {
    expect(normalizePriceBounds(500, 100)).toEqual({ min: null, max: null });
  });

  it("ignores a negative floor but honours a negative ceiling", () => {
    expect(normalizePriceBounds(-40, 100)).toEqual({ min: null, max: 100 });
    expect(normalizePriceBounds(undefined, -1)).toEqual({ min: null, max: -1 });
  });

  it("reports whether anything was actually asked of price", () => {
    expect(hasPriceBounds(normalizePriceBounds(undefined, undefined))).toBe(false);
    expect(hasPriceBounds(normalizePriceBounds(undefined, 0))).toBe(true);
    expect(hasPriceBounds(normalizePriceBounds(10, 800))).toBe(true);
  });
});

describe("convertPriceBand", () => {
  it("passes a band already in the filter currency through untouched", () => {
    expect(convertPriceBand(eur(120), "EUR", null)).toEqual({ low: 120, high: 120 });
  });

  it("restates another currency's band in the filter currency", () => {
    // 6150 MKD / 61.5 = 100 EUR.
    expect(convertPriceBand(mkd(6150, 12300), "EUR", eurContext())).toEqual({
      low: 100,
      high: 200,
    });
  });

  it("converts a third currency through the base, not just EUR and MKD", () => {
    // 85 GBP / 0.85 = 100 EUR.
    expect(convertPriceBand(gbp(85), "EUR", eurContext())).toEqual({
      low: 100,
      high: 100,
    });
  });

  it("refuses rather than guesses when there is no rate table at all", () => {
    expect(convertPriceBand(mkd(6150), "EUR", null)).toBeNull();
  });

  it("refuses when the listing's own currency is not quoted", () => {
    const context = eurContext({ EUR: 1, GBP: 0.85 });
    expect(convertPriceBand(mkd(6150), "EUR", context)).toBeNull();
  });

  it("refuses when the rate table was built for a different filter currency", () => {
    // A context quoting into DKK cannot answer a question asked in EUR. Using it
    // anyway is exactly the silent mixed-currency comparison this module exists to
    // prevent.
    const dkkContext: ConversionContext = { display: "DKK", rates: RATES };
    expect(convertPriceBand(mkd(6150), "EUR", dkkContext)).toBeNull();
  });

  it("refuses a non-finite amount instead of ranking it", () => {
    expect(
      convertPriceBand({ currency: "EUR", low: Number.NaN, high: 10 }, "EUR", null),
    ).toBeNull();
  });
});

describe("bandMatchesBounds", () => {
  const bounds = normalizePriceBounds(100, 200);

  it("includes listings sitting exactly on either boundary", () => {
    expect(bandMatchesBounds({ low: 100, high: 100 }, bounds)).toBe(true);
    expect(bandMatchesBounds({ low: 200, high: 200 }, bounds)).toBe(true);
  });

  it("excludes listings just outside either boundary", () => {
    expect(bandMatchesBounds({ low: 99.99, high: 99.99 }, bounds)).toBe(false);
    expect(bandMatchesBounds({ low: 200.01, high: 200.01 }, bounds)).toBe(false);
  });

  it("matches a range that overlaps the band even when it runs past both ends", () => {
    // The documented no-date rule: a card showing 80–300 can be booked in-band, and
    // the card prints both ends, so nothing is promised that will not be honoured.
    expect(bandMatchesBounds({ low: 80, high: 300 }, bounds)).toBe(true);
    expect(bandMatchesBounds({ low: 150, high: 900 }, bounds)).toBe(true);
    expect(bandMatchesBounds({ low: 10, high: 100 }, bounds)).toBe(true);
  });

  it("excludes a range that clears the band entirely on either side", () => {
    expect(bandMatchesBounds({ low: 10, high: 99 }, bounds)).toBe(false);
    expect(bandMatchesBounds({ low: 201, high: 900 }, bounds)).toBe(false);
  });

  it("applies a one-sided bound on its own side only", () => {
    const floorOnly = normalizePriceBounds(100, undefined);
    expect(bandMatchesBounds({ low: 10_000, high: 10_000 }, floorOnly)).toBe(true);
    expect(bandMatchesBounds({ low: 99, high: 99 }, floorOnly)).toBe(false);

    const ceilingOnly = normalizePriceBounds(undefined, 200);
    expect(bandMatchesBounds({ low: 1, high: 1 }, ceilingOnly)).toBe(true);
    expect(bandMatchesBounds({ low: 201, high: 201 }, ceilingOnly)).toBe(false);
  });
});

function candidate(
  id: string,
  low: number | null,
  createdAt = 1_000,
  high = low,
): PriceCandidate {
  return {
    id,
    createdAt,
    band: low === null ? null : { low, high: high ?? low },
  };
}

describe("ordering", () => {
  it("sorts ascending and descending on the same normalised value", () => {
    const candidates = [
      candidate("b", 200),
      candidate("a", 100),
      candidate("c", 150),
    ];
    expect(
      orderPriceCandidates(candidates, normalizePriceBounds(), "price_asc"),
    ).toEqual(["a", "c", "b"]);
    expect(
      orderPriceCandidates(candidates, normalizePriceBounds(), "price_desc"),
    ).toEqual(["b", "c", "a"]);
  });

  it("orders equivalent prices from different currencies as ties, not as raw numbers", () => {
    // 6150 MKD and 100 EUR are the same money. Compared raw, the denar listing would
    // sort above every euro listing on the page.
    const context = eurContext();
    const denar = convertPriceBand(mkd(6150), "EUR", context);
    const euro = convertPriceBand(eur(100), "EUR", context);
    expect(denar).toEqual(euro);

    const candidates: PriceCandidate[] = [
      { id: "denar", createdAt: 1_000, band: denar },
      { id: "euro", createdAt: 2_000, band: euro },
      { id: "cheaper", createdAt: 3_000, band: convertPriceBand(eur(80), "EUR", context) },
    ];
    expect(
      orderPriceCandidates(candidates, normalizePriceBounds(), "price_asc"),
    ).toEqual(["cheaper", "euro", "denar"]);
  });

  it("breaks equal prices by newest first, then id, so paging is stable", () => {
    const sameMoment = [
      candidate("zulu", 100, 5_000),
      candidate("alpha", 100, 5_000),
      candidate("older", 100, 1_000),
    ];
    const forwards = orderPriceCandidates(
      sameMoment,
      normalizePriceBounds(),
      "price_asc",
    );
    expect(forwards).toEqual(["alpha", "zulu", "older"]);

    // Same answer whatever order they arrive in — otherwise page 2 can repeat a
    // listing page 1 already showed.
    const shuffled = orderPriceCandidates(
      [...sameMoment].reverse(),
      normalizePriceBounds(),
      "price_asc",
    );
    expect(shuffled).toEqual(forwards);
  });

  it("keeps the same tie-break under descending order", () => {
    const candidates = [
      candidate("zulu", 100, 5_000),
      candidate("alpha", 100, 5_000),
      candidate("dearer", 300, 9_000),
    ];
    expect(
      orderPriceCandidates(candidates, normalizePriceBounds(), "price_desc"),
    ).toEqual(["dearer", "alpha", "zulu"]);
  });

  it("collects listings it could not price at the end rather than hiding them", () => {
    const candidates = [
      candidate("unpriceable", null, 9_000),
      candidate("dear", 300),
      candidate("cheap", 100),
    ];
    expect(
      orderPriceCandidates(candidates, normalizePriceBounds(), "price_asc"),
    ).toEqual(["cheap", "dear", "unpriceable"]);
    expect(
      orderPriceCandidates(candidates, normalizePriceBounds(), "price_desc"),
    ).toEqual(["dear", "cheap", "unpriceable"]);
  });

  it("drops listings it could not price once a bound has to be honoured", () => {
    const candidates = [
      candidate("unpriceable", null),
      candidate("inside", 150),
      candidate("outside", 900),
    ];
    expect(
      orderPriceCandidates(candidates, normalizePriceBounds(100, 200), "price_asc"),
    ).toEqual(["inside"]);
  });

  it("leaves the newest-first order alone when no price question was asked", () => {
    const candidates = [
      candidate("old", 100, 1_000),
      candidate("new", 900, 9_000),
      candidate("unpriceable", null, 5_000),
    ];
    expect(
      orderPriceCandidates(candidates, normalizePriceBounds(), "newest"),
    ).toEqual(["new", "unpriceable", "old"]);
  });

  it("is a total order, so Array.prototype.sort cannot reorder equal entries", () => {
    const left = candidate("a", 100, 5_000);
    const right = candidate("b", 100, 5_000);
    expect(comparePriceCandidates(left, right, "price_asc")).toBeLessThan(0);
    expect(comparePriceCandidates(right, left, "price_asc")).toBeGreaterThan(0);
    expect(comparePriceCandidates(left, left, "price_asc")).toBe(0);
  });
});

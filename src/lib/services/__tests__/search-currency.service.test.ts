import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { addDays, format } from "date-fns";
import { db } from "@/lib/db";
import { ymdToDbDate } from "@/lib/utils/date-only";
import {
  createTestHostAndListing,
  cleanupTestFixtures,
  type TestFixtures,
} from "./test-helpers";

/**
 * M5: price filtering, display, sorting and paging all reading the same
 * currency-normalised effective price.
 *
 * The rate table is mocked rather than fetched. These assertions are about what the
 * search does with a snapshot, not about whether the provider is up, and a real
 * `getExchangeRates` would put a network call and a cross-test cache in the middle of
 * every one of them.
 */
interface MockRateTable {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
  provider: string;
  stale: boolean;
}

const rateState = vi.hoisted(() => ({
  table: null as MockRateTable | null,
  /** Set to make the lookup itself fail, the way `unstable_cache` does outside a
   *  request context and the way a snapshot read can fail on its own. */
  throws: false,
}));

vi.mock("@/lib/currency/rates", () => ({
  EXCHANGE_RATES_TAG: "exchange-rates",
  getExchangeRates: async () => {
    if (rateState.throws) throw new Error("rate lookup unavailable");
    return rateState.table;
  },
  quotableCurrencies: (table: MockRateTable | null) =>
    table ? Object.keys(table.rates).sort() : ["EUR"],
}));

/**
 * `getActivePropertyTypes` is wrapped in `unstable_cache`, which throws outside a Next
 * request context — nothing to do with pricing, but `getSearchFilterPreview` sorts its
 * property-type facet through it. The real rows are read straight from the database
 * here so the preview can be exercised at all.
 */
vi.mock("@/lib/services/property-type.service", async () => {
  const { db: database } = await import("@/lib/db");
  return {
    PROPERTY_TYPES_TAG: "property-types",
    getActivePropertyTypes: async () =>
      database.propertyType.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { value: true, label: true, icon: true, description: true },
      }),
  };
});

const { searchListings, getSearchFilterPreview } = await import(
  "@/lib/services/search.service"
);

/** One euro buys 61.5 denars, 0.85 pounds. Approximately real, and exact enough in
 *  binary that 6150 MKD converts to precisely 100 EUR. */
const LIVE_RATES: MockRateTable = {
  base: "EUR",
  rates: { EUR: 1, MKD: 61.5, GBP: 0.85 },
  fetchedAt: new Date().toISOString(),
  provider: "test",
  stale: false,
};

const created: TestFixtures[] = [];

async function makeListing(options: {
  city: string;
  currency?: string;
  baseNightlyRate: number;
  cleaningFee?: number;
  createdAt?: Date;
}) {
  const { host, property, listing } = await createTestHostAndListing();
  created.push({
    hostId: host.id,
    propertyId: property.id,
    listingId: listing.id,
    extraUserIds: [],
  });

  await db.property.update({
    where: { id: property.id },
    data: { city: options.city },
  });
  await db.pricingRule.update({
    where: { listingId: listing.id },
    data: {
      baseNightlyRate: options.baseNightlyRate,
      cleaningFee: options.cleaningFee ?? 0,
      currency: options.currency ?? "EUR",
    },
  });
  if (options.createdAt) {
    await db.listing.update({
      where: { id: listing.id },
      data: { createdAt: options.createdAt },
    });
  }

  return listing.id;
}

async function setNightlyOverride(listingId: string, ymd: string, rate: number) {
  await db.listingDatePrice.create({
    data: { listingId, date: ymdToDbDate(ymd), nightlyRate: rate },
  });
}

/** A calendar day well inside both the 12-month range horizon and any stay window,
 *  expressed the way the URL expresses it. */
function dayFromNow(offset: number): string {
  return format(addDays(new Date(), offset), "yyyy-MM-dd");
}

function uniqueCity(label: string) {
  return `M5 ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

beforeEach(() => {
  rateState.table = LIVE_RATES;
  rateState.throws = false;
});

afterEach(async () => {
  for (const fixtures of created.splice(0)) {
    await cleanupTestFixtures(fixtures);
  }
});

describe("price filtering across currencies", () => {
  it("compares every listing in the filter's currency, not in the host's", async () => {
    const city = uniqueCity("mixed");
    // All three are the same money: 100 EUR. Compared raw against a 90–110 band, the
    // denar listing (6150) and the pound listing (85) both fall outside it — one far
    // above, one below — which is exactly what M5 reported.
    const euro = await makeListing({ city, baseNightlyRate: 100 });
    const denar = await makeListing({
      city,
      currency: "MKD",
      baseNightlyRate: 6150,
    });
    const pound = await makeListing({
      city,
      currency: "GBP",
      baseNightlyRate: 85,
    });
    const cheapDenar = await makeListing({
      city,
      currency: "MKD",
      baseNightlyRate: 3075, // 50 EUR
    });

    const result = await searchListings({
      city,
      minPrice: 90,
      maxPrice: 110,
      currency: "EUR",
    });
    const ids = result.listings.map((listing) => listing.id);

    expect(ids).toEqual(expect.arrayContaining([euro, denar, pound]));
    expect(ids).not.toContain(cheapDenar);
    expect(result.total).toBe(3);
    expect(result.priceComparison).toEqual({
      currency: "EUR",
      applied: true,
      complete: true,
      unconvertible: 0,
    });
  });

  it("treats equivalent converted prices as equal when ordering", async () => {
    const city = uniqueCity("equivalent");
    const cheap = await makeListing({ city, baseNightlyRate: 40 });
    const denar = await makeListing({
      city,
      currency: "MKD",
      baseNightlyRate: 6150, // 100 EUR
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const euro = await makeListing({
      city,
      baseNightlyRate: 100,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    const dear = await makeListing({ city, baseNightlyRate: 500 });

    const ascending = await searchListings({ city, sort: "price_asc", currency: "EUR" });
    // The two 100-EUR listings tie and fall back to newest-first, so the euro one
    // (created later) precedes the denar one. Sorting on the raw column would have put
    // 6150 at the very end instead.
    expect(ascending.listings.map((l) => l.id)).toEqual([cheap, euro, denar, dear]);

    const descending = await searchListings({
      city,
      sort: "price_desc",
      currency: "EUR",
    });
    expect(descending.listings.map((l) => l.id)).toEqual([dear, euro, denar, cheap]);
  });

  it("includes listings sitting exactly on either boundary", async () => {
    const city = uniqueCity("boundaries");
    const atFloor = await makeListing({ city, baseNightlyRate: 100 });
    const atCeiling = await makeListing({
      city,
      currency: "MKD",
      baseNightlyRate: 12300, // exactly 200 EUR
    });
    const belowFloor = await makeListing({ city, baseNightlyRate: 99.99 });
    const aboveCeiling = await makeListing({ city, baseNightlyRate: 200.01 });

    const result = await searchListings({
      city,
      minPrice: 100,
      maxPrice: 200,
      currency: "EUR",
    });
    const ids = result.listings.map((l) => l.id);

    expect(ids).toEqual(expect.arrayContaining([atFloor, atCeiling]));
    expect(ids).not.toContain(belowFloor);
    expect(ids).not.toContain(aboveCeiling);
  });

  it("reads a zero maximum as a filter and a zero minimum as no filter", async () => {
    const city = uniqueCity("zero");
    const free = await makeListing({ city, baseNightlyRate: 0 });
    const paid = await makeListing({ city, baseNightlyRate: 100 });

    const freeOnly = await searchListings({ city, maxPrice: 0, currency: "EUR" });
    expect(freeOnly.listings.map((l) => l.id)).toEqual([free]);

    const noFloor = await searchListings({ city, minPrice: 0, currency: "EUR" });
    expect(noFloor.listings.map((l) => l.id)).toEqual(
      expect.arrayContaining([free, paid]),
    );
    expect(noFloor.priceComparison.applied).toBe(false);
  });
});

describe("effective price with dates", () => {
  it("filters on the overridden nightly rate, not the base rate", async () => {
    const city = uniqueCity("overrides");
    const checkIn = dayFromNow(60);
    const checkOut = dayFromNow(62);

    // The audit's own example: a 100 base with a 300 override for the searched
    // nights, which used to match "under 150" and then render 300 on the card.
    const overridden = await makeListing({ city, baseNightlyRate: 100 });
    await setNightlyOverride(overridden, checkIn, 300);
    await setNightlyOverride(overridden, dayFromNow(61), 300);
    const plain = await makeListing({ city, baseNightlyRate: 100 });

    const cheapBand = await searchListings({
      city,
      checkIn,
      checkOut,
      maxPrice: 150,
      currency: "EUR",
    });
    expect(cheapBand.listings.map((l) => l.id)).toEqual([plain]);

    const dearBand = await searchListings({
      city,
      checkIn,
      checkOut,
      minPrice: 250,
      maxPrice: 350,
      currency: "EUR",
    });
    expect(dearBand.listings.map((l) => l.id)).toEqual([overridden]);
  });

  it("filters on the promotion-adjusted nightly rate", async () => {
    const city = uniqueCity("promotions");
    const checkIn = dayFromNow(70);
    const checkOut = dayFromNow(72);

    const discounted = await makeListing({ city, baseNightlyRate: 200 });
    await db.listingPromotion.create({
      data: {
        listingId: discounted,
        type: "PERCENT_DISCOUNT",
        discountPercent: 50,
      },
    });
    const fullPrice = await makeListing({ city, baseNightlyRate: 200 });

    const result = await searchListings({
      city,
      checkIn,
      checkOut,
      maxPrice: 120,
      currency: "EUR",
    });

    // 200 less 50% is 100 a night, which is inside the band the base rate is not.
    expect(result.listings.map((l) => l.id)).toEqual([discounted]);
    expect(result.listings.map((l) => l.id)).not.toContain(fullPrice);
  });
});

describe("effective price without dates", () => {
  it("matches a listing whose displayed range overlaps the band", async () => {
    const city = uniqueCity("ranges");
    // Card reads "100 – 300 a night": bookable at 100 most of the year, 300 on one.
    const ranged = await makeListing({ city, baseNightlyRate: 100 });
    await setNightlyOverride(ranged, dayFromNow(45), 300);

    const overlapsLowEnd = await searchListings({
      city,
      maxPrice: 150,
      currency: "EUR",
    });
    expect(overlapsLowEnd.listings.map((l) => l.id)).toEqual([ranged]);

    const overlapsHighEnd = await searchListings({
      city,
      minPrice: 250,
      currency: "EUR",
    });
    expect(overlapsHighEnd.listings.map((l) => l.id)).toEqual([ranged]);

    const belowTheRange = await searchListings({
      city,
      maxPrice: 90,
      currency: "EUR",
    });
    expect(belowTheRange.listings).toEqual([]);

    const aboveTheRange = await searchListings({
      city,
      minPrice: 350,
      currency: "EUR",
    });
    expect(aboveTheRange.listings).toEqual([]);
  });

  it("sorts undated listings on the price the card leads with", async () => {
    const city = uniqueCity("range-sort");
    // Its range starts at 60 even though its base is 100 — the card prints 60, so the
    // sort has to agree with it.
    const dips = await makeListing({ city, baseNightlyRate: 100 });
    await setNightlyOverride(dips, dayFromNow(30), 60);
    const flat = await makeListing({ city, baseNightlyRate: 80 });

    const ascending = await searchListings({ city, sort: "price_asc", currency: "EUR" });
    expect(ascending.listings.map((l) => l.id)).toEqual([dips, flat]);
    expect(ascending.listings[0].nightlyRange?.min).toBe(60);
  });
});

describe("pagination", () => {
  it("pages the full sorted set rather than sorting one database page", async () => {
    const city = uniqueCity("paging");
    const ids: string[] = [];
    // Descending prices in creation order, so the database's own default ordering
    // (newest first) is the exact reverse of the price order being asked for. A sort
    // applied to one pre-paginated page would give page 1 the *dearest* twelve.
    for (let index = 0; index < 15; index += 1) {
      ids.push(
        await makeListing({ city, baseNightlyRate: 1000 - index * 10 }),
      );
    }

    const first = await searchListings({ city, sort: "price_asc", currency: "EUR" });
    const second = await searchListings({
      city,
      sort: "price_asc",
      page: 2,
      currency: "EUR",
    });

    expect(first.total).toBe(15);
    expect(first.totalPages).toBe(2);
    expect(first.listings).toHaveLength(12);
    expect(second.listings).toHaveLength(3);

    const paged = [...first.listings, ...second.listings].map((l) => l.id);
    expect(new Set(paged).size).toBe(15);
    // Cheapest first across both pages, which is the reverse of creation order.
    expect(paged).toEqual([...ids].reverse());
  });

  it("keeps equal-priced listings in a stable order across pages", async () => {
    const city = uniqueCity("stable");
    const stamp = new Date("2026-03-01T00:00:00.000Z");
    for (let index = 0; index < 14; index += 1) {
      // Identical price and identical createdAt: nothing but the id tie-break can
      // decide the order, and it has to decide it the same way every time.
      await makeListing({ city, baseNightlyRate: 100, createdAt: stamp });
    }

    const runs = await Promise.all([
      searchListings({ city, sort: "price_asc", currency: "EUR" }),
      searchListings({ city, sort: "price_asc", currency: "EUR" }),
    ]);
    expect(runs[0].listings.map((l) => l.id)).toEqual(
      runs[1].listings.map((l) => l.id),
    );

    const second = await searchListings({
      city,
      sort: "price_asc",
      page: 2,
      currency: "EUR",
    });
    const paged = [
      ...runs[0].listings.map((l) => l.id),
      ...second.listings.map((l) => l.id),
    ];
    expect(new Set(paged).size).toBe(14);
  });
});

describe("unavailable exchange rates", () => {
  it("excludes listings it cannot convert from a bounded search, and says so", async () => {
    const city = uniqueCity("no-rates");
    rateState.table = null;

    const euro = await makeListing({ city, baseNightlyRate: 100 });
    await makeListing({ city, currency: "MKD", baseNightlyRate: 6150 });

    const result = await searchListings({
      city,
      minPrice: 90,
      maxPrice: 110,
      currency: "EUR",
    });

    // The denar listing is 100 EUR, but nothing here can know that. Including it would
    // be a raw 6150-vs-110 comparison in disguise.
    expect(result.listings.map((l) => l.id)).toEqual([euro]);
    expect(result.priceComparison).toEqual({
      currency: "EUR",
      applied: true,
      complete: false,
      unconvertible: 1,
    });
  });

  it("excludes a listing whose currency the table does not quote", async () => {
    const city = uniqueCity("unquoted");
    rateState.table = {
      ...LIVE_RATES,
      rates: { EUR: 1, GBP: 0.85 },
    };

    const euro = await makeListing({ city, baseNightlyRate: 100 });
    await makeListing({ city, currency: "MKD", baseNightlyRate: 6150 });

    const result = await searchListings({
      city,
      minPrice: 90,
      maxPrice: 110,
      currency: "EUR",
    });
    expect(result.listings.map((l) => l.id)).toEqual([euro]);
    expect(result.priceComparison.complete).toBe(false);
  });

  it("sorts unconvertible listings last rather than hiding them", async () => {
    const city = uniqueCity("sort-no-rates");
    rateState.table = null;

    const denar = await makeListing({
      city,
      currency: "MKD",
      baseNightlyRate: 6150,
    });
    const dear = await makeListing({ city, baseNightlyRate: 500 });
    const cheap = await makeListing({ city, baseNightlyRate: 100 });

    const result = await searchListings({ city, sort: "price_asc", currency: "EUR" });

    expect(result.listings.map((l) => l.id)).toEqual([cheap, dear, denar]);
    expect(result.total).toBe(3);
    expect(result.priceComparison.complete).toBe(false);
  });

  it("returns a search rather than an error when the rate lookup itself fails", async () => {
    const city = uniqueCity("rates-throw");
    rateState.throws = true;

    const euro = await makeListing({ city, baseNightlyRate: 100 });
    await makeListing({ city, currency: "MKD", baseNightlyRate: 6150 });

    const result = await searchListings({
      city,
      minPrice: 90,
      maxPrice: 110,
      currency: "EUR",
    });

    expect(result.listings.map((l) => l.id)).toEqual([euro]);
    expect(result.priceComparison.complete).toBe(false);
  });

  it("needs no rate table at all when every listing already quotes the filter currency", async () => {
    const city = uniqueCity("no-conversion");
    rateState.table = null;

    const only = await makeListing({ city, baseNightlyRate: 100 });
    const result = await searchListings({
      city,
      minPrice: 90,
      maxPrice: 110,
      currency: "EUR",
    });

    expect(result.listings.map((l) => l.id)).toEqual([only]);
    expect(result.priceComparison.complete).toBe(true);
  });
});

describe("filter preview", () => {
  it("counts exactly what the results page will show", async () => {
    const city = uniqueCity("preview");
    await makeListing({ city, baseNightlyRate: 100 });
    await makeListing({ city, currency: "MKD", baseNightlyRate: 6150 });
    await makeListing({ city, currency: "MKD", baseNightlyRate: 3075 });

    const filters = { city, minPrice: 90, maxPrice: 110, currency: "EUR" };
    const [preview, results] = await Promise.all([
      getSearchFilterPreview(filters),
      searchListings(filters),
    ]);

    expect(preview.totalCount).toBe(results.total);
    expect(preview.totalCount).toBe(2);
    expect(preview.priceComparison).toEqual(results.priceComparison);
  });

  it("reports the same incomplete comparison the results page does", async () => {
    const city = uniqueCity("preview-no-rates");
    rateState.table = null;
    await makeListing({ city, baseNightlyRate: 100 });
    await makeListing({ city, currency: "MKD", baseNightlyRate: 6150 });

    const filters = { city, minPrice: 90, maxPrice: 110, currency: "EUR" };
    const [preview, results] = await Promise.all([
      getSearchFilterPreview(filters),
      searchListings(filters),
    ]);

    expect(preview.totalCount).toBe(results.total);
    expect(preview.priceComparison.complete).toBe(false);
    expect(preview.priceComparison.unconvertible).toBe(1);
  });
});

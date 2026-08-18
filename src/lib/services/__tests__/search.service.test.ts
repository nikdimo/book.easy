import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { searchListings } from "@/lib/services/search.service";
import {
  createTestHostAndListing,
  cleanupTestFixtures,
  type TestFixtures,
} from "./test-helpers";

describe("searchListings amenity filter", () => {
  let fixturesA: TestFixtures | undefined;
  let fixturesB: TestFixtures | undefined;
  let amenityIds: string[] = [];

  afterEach(async () => {
    if (fixturesA) await cleanupTestFixtures(fixturesA);
    if (fixturesB) await cleanupTestFixtures(fixturesB);
    if (amenityIds.length > 0) {
      await db.amenity.deleteMany({ where: { id: { in: amenityIds } } });
    }
    fixturesA = undefined;
    fixturesB = undefined;
    amenityIds = [];
  });

  it("requires ALL selected amenities (US-05.05), not just any one of them", async () => {
    // Any real category will do — this test is about amenity filtering, not grouping.
    const category = await db.amenityCategory.findFirstOrThrow({
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    const stamp = Date.now();
    const wifi = await db.amenity.create({
      data: {
        name: `__Test WiFi ${stamp}__`,
        key: `__test_wifi_${stamp}__`,
        categoryId: category.id,
      },
    });
    const pool = await db.amenity.create({
      data: {
        name: `__Test Pool ${stamp}__`,
        key: `__test_pool_${stamp}__`,
        categoryId: category.id,
      },
    });
    amenityIds = [wifi.id, pool.id];

    const { host: hostA, property: propertyA, listing: listingA } =
      await createTestHostAndListing();
    fixturesA = {
      hostId: hostA.id,
      propertyId: propertyA.id,
      listingId: listingA.id,
      extraUserIds: [],
    };
    // listingA has WiFi only.
    await db.listingAmenity.create({ data: { listingId: listingA.id, amenityId: wifi.id } });

    const { host: hostB, property: propertyB, listing: listingB } =
      await createTestHostAndListing();
    fixturesB = {
      hostId: hostB.id,
      propertyId: propertyB.id,
      listingId: listingB.id,
      extraUserIds: [],
    };
    // listingB has both WiFi and Pool.
    await db.listingAmenity.createMany({
      data: [
        { listingId: listingB.id, amenityId: wifi.id },
        { listingId: listingB.id, amenityId: pool.id },
      ],
    });

    const wifiOnly = await searchListings({ amenities: [wifi.name] });
    const wifiOnlyIds = wifiOnly.listings.map((l) => l.id);
    expect(wifiOnlyIds).toContain(listingA.id);
    expect(wifiOnlyIds).toContain(listingB.id);

    const wifiAndPool = await searchListings({ amenities: [wifi.name, pool.name] });
    const wifiAndPoolIds = wifiAndPool.listings.map((l) => l.id);
    expect(wifiAndPoolIds).not.toContain(listingA.id); // lacks Pool — must be excluded
    expect(wifiAndPoolIds).toContain(listingB.id); // has both — must be included
  });
});

describe("searchListings price filter", () => {
  let low: TestFixtures | undefined;
  let withinRange: TestFixtures | undefined;
  let high: TestFixtures | undefined;

  afterEach(async () => {
    if (low) await cleanupTestFixtures(low);
    if (withinRange) await cleanupTestFixtures(withinRange);
    if (high) await cleanupTestFixtures(high);
    low = undefined;
    withinRange = undefined;
    high = undefined;
  });

  it("applies the minimum and maximum nightly price together", async () => {
    const lowListing = await createTestHostAndListing();
    low = {
      hostId: lowListing.host.id,
      propertyId: lowListing.property.id,
      listingId: lowListing.listing.id,
      extraUserIds: [],
    };

    const matchingListing = await createTestHostAndListing();
    withinRange = {
      hostId: matchingListing.host.id,
      propertyId: matchingListing.property.id,
      listingId: matchingListing.listing.id,
      extraUserIds: [],
    };

    const highListing = await createTestHostAndListing();
    high = {
      hostId: highListing.host.id,
      propertyId: highListing.property.id,
      listingId: highListing.listing.id,
      extraUserIds: [],
    };

    await Promise.all([
      db.pricingRule.update({
        where: { listingId: lowListing.listing.id },
        data: { baseNightlyRate: 50 },
      }),
      db.pricingRule.update({
        where: { listingId: matchingListing.listing.id },
        data: { baseNightlyRate: 150 },
      }),
      db.pricingRule.update({
        where: { listingId: highListing.listing.id },
        data: { baseNightlyRate: 250 },
      }),
    ]);

    const result = await searchListings({ minPrice: 100, maxPrice: 200 });
    const resultIds = result.listings.map((listing) => listing.id);

    expect(resultIds).not.toContain(lowListing.listing.id);
    expect(resultIds).toContain(matchingListing.listing.id);
    expect(resultIds).not.toContain(highListing.listing.id);
  });
});

describe("searchListings minimum-stay filter", () => {
  let shortStay: TestFixtures | undefined;
  let longStay: TestFixtures | undefined;

  afterEach(async () => {
    if (shortStay) await cleanupTestFixtures(shortStay);
    if (longStay) await cleanupTestFixtures(longStay);
    shortStay = undefined;
    longStay = undefined;
  });

  it("excludes listings whose minimum stay is longer than the selected dates", async () => {
    const city = `Minimum Stay Test ${Date.now()}`;
    const shortStayListing = await createTestHostAndListing();
    shortStay = {
      hostId: shortStayListing.host.id,
      propertyId: shortStayListing.property.id,
      listingId: shortStayListing.listing.id,
      extraUserIds: [],
    };

    const longStayListing = await createTestHostAndListing();
    longStay = {
      hostId: longStayListing.host.id,
      propertyId: longStayListing.property.id,
      listingId: longStayListing.listing.id,
      extraUserIds: [],
    };

    await Promise.all([
      db.property.update({
        where: { id: shortStayListing.property.id },
        data: { city },
      }),
      db.property.update({
        where: { id: longStayListing.property.id },
        data: { city },
      }),
      db.pricingRule.update({
        where: { listingId: shortStayListing.listing.id },
        data: { minNights: 3 },
      }),
      db.pricingRule.update({
        where: { listingId: longStayListing.listing.id },
        data: { minNights: 7 },
      }),
    ]);

    const fiveNightFilters = {
      city,
      country: "North Macedonia",
      checkIn: "2026-08-23",
      checkOut: "2026-08-28",
    };
    const fiveNightResults = await searchListings(fiveNightFilters);

    expect(fiveNightResults.listings.map((listing) => listing.id)).toEqual([
      shortStayListing.listing.id,
    ]);
    expect(fiveNightResults.total).toBe(1);

    const sevenNightResults = await searchListings({
      ...fiveNightFilters,
      checkOut: "2026-08-30",
    });

    expect(sevenNightResults.listings.map((listing) => listing.id)).toEqual(
      expect.arrayContaining([
        shortStayListing.listing.id,
        longStayListing.listing.id,
      ])
    );
    expect(sevenNightResults.total).toBe(2);
  });
});

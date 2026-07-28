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
    const wifi = await db.amenity.create({
      data: { name: `__Test WiFi ${Date.now()}__`, category: "Test" },
    });
    const pool = await db.amenity.create({
      data: { name: `__Test Pool ${Date.now()}__`, category: "Test" },
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

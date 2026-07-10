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

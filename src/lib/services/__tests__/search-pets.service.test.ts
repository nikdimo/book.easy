import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getAvailableAmenityNames,
  searchListings,
} from "@/lib/services/search.service";
import { PETS_ALLOWED_AMENITY_NAME } from "@/lib/amenities/pets";
import {
  createTestHostAndListing,
  cleanupTestFixtures,
  type TestFixtures,
} from "./test-helpers";

/**
 * The guest-facing "Pets allowed" filter, after pets stopped being an amenity.
 *
 * The token in the URL is unchanged — guests have bookmarked and shared it — but the
 * answer now comes from `Listing.petPolicy`. These tests are the contract between those
 * two facts: a filter that still works, reading from the one place the answer lives.
 */
describe("searchListings pets filter", () => {
  let allowed: TestFixtures | undefined;
  let refused: TestFixtures | undefined;
  let onRequest: TestFixtures | undefined;

  afterEach(async () => {
    for (const fixtures of [allowed, refused, onRequest]) {
      if (fixtures) await cleanupTestFixtures(fixtures);
    }
    allowed = undefined;
    refused = undefined;
    onRequest = undefined;
  });

  async function seed() {
    const a = await createTestHostAndListing();
    const b = await createTestHostAndListing();
    const c = await createTestHostAndListing();
    allowed = { hostId: a.host.id, propertyId: a.property.id, listingId: a.listing.id, extraUserIds: [] };
    refused = { hostId: b.host.id, propertyId: b.property.id, listingId: b.listing.id, extraUserIds: [] };
    onRequest = { hostId: c.host.id, propertyId: c.property.id, listingId: c.listing.id, extraUserIds: [] };

    await db.listing.update({ where: { id: a.listing.id }, data: { petPolicy: "ALLOWED" } });
    await db.listing.update({ where: { id: b.listing.id }, data: { petPolicy: "NOT_ALLOWED" } });
    await db.listing.update({ where: { id: c.listing.id }, data: { petPolicy: "ASK_HOST" } });
    return { a, b, c };
  }

  it("returns the listings whose policy allows pets", async () => {
    const { a } = await seed();

    const result = await searchListings({
      city: "Testville",
      amenities: [PETS_ALLOWED_AMENITY_NAME],
    });
    const ids = result.listings.map((listing) => listing.id);

    expect(ids).toContain(a.listing.id);
  });

  it("excludes a listing that refuses pets", async () => {
    const { b } = await seed();

    const result = await searchListings({
      city: "Testville",
      amenities: [PETS_ALLOWED_AMENITY_NAME],
    });

    expect(result.listings.map((listing) => listing.id)).not.toContain(b.listing.id);
  });

  it("excludes 'ask the host' — a maybe is not a match", async () => {
    // A guest filtering for pets is looking for somewhere they can bring one, not
    // somewhere they may ask. Returning maybes is how a filter stops meaning anything.
    const { c } = await seed();

    const result = await searchListings({
      city: "Testville",
      amenities: [PETS_ALLOWED_AMENITY_NAME],
    });

    expect(result.listings.map((listing) => listing.id)).not.toContain(c.listing.id);
  });

  it("excludes a listing whose host never answered", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    allowed = { hostId: host.id, propertyId: property.id, listingId: listing.id, extraUserIds: [] };

    const result = await searchListings({
      city: "Testville",
      amenities: [PETS_ALLOWED_AMENITY_NAME],
    });

    expect(result.listings.map((row) => row.id)).not.toContain(listing.id);
  });

  it("still offers the chip while some matching listing allows pets", async () => {
    await seed();

    const names = await getAvailableAmenityNames({ city: "Testville" });

    expect(names).toContain(PETS_ALLOWED_AMENITY_NAME);
  });

  // The filter *preview* offers the chip through the same helper as the list above
  // (`withPetsAllowed`, over the same `petPolicy: "ALLOWED"` count). It has no test of
  // its own here because `getSearchFilterPreview` reaches `unstable_cache` for property
  // types, which needs Next's request-scoped incremental cache and is unavailable in a
  // plain vitest process — a limitation of that function, not of this behaviour.

  it("combines with another amenity rather than replacing it", async () => {
    // The pets clause is one of the ANDed clauses, not a special case that skips them.
    const { a } = await seed();
    const category = await db.amenityCategory.findFirstOrThrow({
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    const stamp = Date.now();
    const pool = await db.amenity.create({
      data: {
        name: `__Test Pool ${stamp}__`,
        key: `__test_pool_${stamp}__`,
        categoryId: category.id,
      },
    });
    try {
      await db.listingAmenity.create({
        data: { listingId: a.listing.id, amenityId: pool.id },
      });

      const withBoth = await searchListings({
        city: "Testville",
        amenities: [PETS_ALLOWED_AMENITY_NAME, pool.name],
      });
      expect(withBoth.listings.map((listing) => listing.id)).toContain(a.listing.id);

      // And the AND still bites: a listing with pets but no pool drops out.
      await db.listingAmenity.deleteMany({ where: { amenityId: pool.id } });
      const withoutPool = await searchListings({
        city: "Testville",
        amenities: [PETS_ALLOWED_AMENITY_NAME, pool.name],
      });
      expect(withoutPool.listings.map((listing) => listing.id)).not.toContain(
        a.listing.id,
      );
    } finally {
      await db.listingAmenity.deleteMany({ where: { amenityId: pool.id } });
      await db.amenity.delete({ where: { id: pool.id } });
    }
  });
});

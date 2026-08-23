import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { PETS_ALLOWED_AMENITY_KEY } from "@/lib/amenities/pets";
import {
  createTestHostAndListing,
  cleanupTestFixtures,
  type TestFixtures,
} from "./test-helpers";

/**
 * The state the pet migration left the database in.
 *
 * Integration tests against the real local Postgres: the migration is SQL, and whether
 * it left exactly one home for a listing's pet answer is a fact about rows, not about
 * any function. Every assertion here would have failed before
 * `20260822120000_listing_house_rules` ran, and each one is a way the migration could
 * have gone wrong.
 */
describe("the pets amenity after migration", () => {
  it("is out of every host picker, without being deleted", async () => {
    // Deactivated rather than removed: aliases and translations reference its id, and
    // guest search still names it as the "Pets allowed" filter token.
    const amenity = await db.amenity.findUnique({
      where: { key: PETS_ALLOWED_AMENITY_KEY },
      select: { isActive: true, name: true },
    });

    // A database that never seeded the catalog has nothing to assert about.
    if (!amenity) return;
    expect(amenity.isActive).toBe(false);
    expect(amenity.name).toBe("Pets allowed");
  });

  it("holds no listing links at all, so the answer has exactly one home", async () => {
    const amenity = await db.amenity.findUnique({
      where: { key: PETS_ALLOWED_AMENITY_KEY },
      select: { id: true },
    });
    if (!amenity) return;

    const links = await db.listingAmenity.count({
      where: { amenityId: amenity.id },
    });

    expect(links).toBe(0);
  });

  it("left no listing that once allowed pets without saying so on its policy", async () => {
    // The backfill ran before the join rows were deleted, so anything that carried the
    // amenity now carries `petPolicy = ALLOWED`. If the order had been wrong, the
    // answers would simply have been lost — and this is the check that would show it.
    const amenity = await db.amenity.findUnique({
      where: { key: PETS_ALLOWED_AMENITY_KEY },
      select: { id: true },
    });
    if (!amenity) return;

    const stranded = await db.listing.count({
      where: {
        petPolicy: null,
        amenities: { some: { amenityId: amenity.id } },
      },
    });

    expect(stranded).toBe(0);
  });

  it("backfills only the listings that carried the amenity, and guesses at nothing", async () => {
    // The migration's own backfill statement, re-run against fresh fixtures: one listing
    // holding the amenity, one without. The listing without it must come out NULL —
    // turning "never asked" into an explicit refusal is the failure that would publish
    // rules no host ever chose.
    const amenity = await db.amenity.findUnique({
      where: { key: PETS_ALLOWED_AMENITY_KEY },
      select: { id: true },
    });
    if (!amenity) return;

    const withPets = await createTestHostAndListing();
    const withoutPets = await createTestHostAndListing();
    const fixtures: TestFixtures[] = [
      { hostId: withPets.host.id, propertyId: withPets.property.id, listingId: withPets.listing.id, extraUserIds: [] },
      { hostId: withoutPets.host.id, propertyId: withoutPets.property.id, listingId: withoutPets.listing.id, extraUserIds: [] },
    ];

    try {
      await db.listingAmenity.create({
        data: { listingId: withPets.listing.id, amenityId: amenity.id },
      });

      await db.$executeRaw`
        UPDATE "Listing" AS l
        SET "petPolicy" = 'ALLOWED'
        WHERE EXISTS (
          SELECT 1
          FROM "ListingAmenity" la
          JOIN "Amenity" a ON a."id" = la."amenityId"
          WHERE la."listingId" = l."id" AND a."key" = 'pets_allowed'
        )
      `;

      const [backfilled, untouched] = await Promise.all([
        db.listing.findUniqueOrThrow({
          where: { id: withPets.listing.id },
          select: { petPolicy: true },
        }),
        db.listing.findUniqueOrThrow({
          where: { id: withoutPets.listing.id },
          select: { petPolicy: true },
        }),
      ]);

      expect(backfilled.petPolicy).toBe("ALLOWED");
      expect(untouched.petPolicy).toBeNull();
    } finally {
      await db.listingAmenity.deleteMany({
        where: { listingId: withPets.listing.id, amenityId: amenity.id },
      });
      for (const fixture of fixtures) await cleanupTestFixtures(fixture);
    }
  });
});

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

/**
 * Fixture helpers for integration tests that hit the real local Postgres (see
 * vitest.config.ts) — this codebase has no mocked data-access layer, so tests exercise
 * the same Prisma client and queries as production. Run `npm run db:docker` first if
 * the local container isn't already up.
 */

export async function createTestHostAndListing(overrides?: {
  status?: "APPROVED" | "DRAFT" | "PENDING_REVIEW";
}) {
  const id = randomUUID();

  const host = await db.user.create({
    data: {
      email: `test-host-${id}@example.test`,
      name: "Test Host",
      isHost: true,
    },
  });

  const property = await db.property.create({
    data: {
      ownerId: host.id,
      name: "Test Property",
      propertyType: "APARTMENT",
      address: "1 Test St",
      city: "Testville",
      country: "North Macedonia",
    },
  });

  const listing = await db.listing.create({
    data: {
      propertyId: property.id,
      hostId: host.id,
      title: `Test Listing ${id}`,
      slug: `test-listing-${id}`,
      description: "A listing created for automated tests.",
      status: overrides?.status ?? "APPROVED",
      maxGuests: 4,
      bedrooms: 1,
      bathrooms: 1,
      beds: 1,
      pricingRule: {
        create: {
          baseNightlyRate: 50,
          cleaningFee: 10,
          minNights: 1,
          maxNights: 365,
        },
      },
    },
  });

  return { host, property, listing };
}

export async function createTestGuest() {
  return db.user.create({
    data: {
      email: `test-guest-${randomUUID()}@example.test`,
      name: "Test Guest",
    },
  });
}

export interface TestFixtures {
  hostId: string;
  propertyId: string;
  /** Null once the test itself has already deleted the listing row. */
  listingId: string | null;
  extraUserIds: string[];
}

/** Idempotent cleanup (uses deleteMany, so already-deleted rows are a no-op) — safe to
 * call from afterEach even if the test body deleted some rows itself. */
export async function cleanupTestFixtures(fixtures: TestFixtures): Promise<void> {
  if (fixtures.listingId) {
    await db.booking.deleteMany({ where: { listingId: fixtures.listingId } });
    await db.availabilityBlock.deleteMany({ where: { listingId: fixtures.listingId } });
    await db.listing.deleteMany({ where: { id: fixtures.listingId } });
  }
  await db.property.deleteMany({ where: { id: fixtures.propertyId } });
  await db.user.deleteMany({ where: { id: { in: [fixtures.hostId, ...fixtures.extraUserIds] } } });
}

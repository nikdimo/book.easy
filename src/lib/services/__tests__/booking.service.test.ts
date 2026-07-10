import { describe, it, expect, afterEach } from "vitest";
import { createBooking } from "@/lib/services/booking.service";
import {
  createTestHostAndListing,
  createTestGuest,
  cleanupTestFixtures,
  type TestFixtures,
} from "./test-helpers";

describe("createBooking concurrency", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("allows only one of two simultaneous requests for the same dates to succeed", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guestA = await createTestGuest();
    const guestB = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guestA.id, guestB.id],
    };

    const checkIn = new Date("2030-06-01");
    const checkOut = new Date("2030-06-05");

    // Both requests race the same advisory lock + DB exclusion constraint (see
    // src/lib/services/booking.service.ts and
    // prisma/migrations/20260710175030_availability_block_no_overlap).
    const results = await Promise.allSettled([
      createBooking({ listingId: listing.id, guestId: guestA.id, checkIn, checkOut, guestCount: 2 }),
      createBooking({ listingId: listing.id, guestId: guestB.id, checkIn, checkOut, guestCount: 2 }),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof createBooking>>> =>
        r.status === "fulfilled"
    );
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toMatch(/no longer available/i);
  });

  it("rejects a second booking for overlapping (not just identical) dates", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guestA = await createTestGuest();
    const guestB = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guestA.id, guestB.id],
    };

    await createBooking({
      listingId: listing.id,
      guestId: guestA.id,
      checkIn: new Date("2030-07-10"),
      checkOut: new Date("2030-07-20"),
      guestCount: 1,
    });

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guestB.id,
        // Overlaps the middle of the first booking's range.
        checkIn: new Date("2030-07-15"),
        checkOut: new Date("2030-07-17"),
        guestCount: 1,
      })
    ).rejects.toThrow(/no longer available/i);
  });
});

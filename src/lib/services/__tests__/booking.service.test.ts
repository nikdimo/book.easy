import { describe, it, expect, afterEach } from "vitest";
import {
  confirmBooking,
  createBooking,
  rejectBooking,
} from "@/lib/services/booking.service";
import { db } from "@/lib/db";
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

describe("createBooking promotion snapshot", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("stores the applied percentage offer and keeps the cleaning fee unchanged", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const promotion = await db.listingPromotion.create({
      data: {
        listingId: listing.id,
        type: "PERCENT_DISCOUNT",
        discountPercent: 20,
        minimumNights: 3,
      },
    });

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: new Date("2031-08-01"),
      checkOut: new Date("2031-08-04"),
      guestCount: 2,
    });

    expect(booking.promotionId).toBe(promotion.id);
    expect(booking.promotionType).toBe("PERCENT_DISCOUNT");
    expect(Number(booking.originalTotal)).toBe(160);
    expect(Number(booking.discountAmount)).toBe(30);
    expect(Number(booking.cleaningFee)).toBe(10);
    expect(Number(booking.totalPrice)).toBe(130);
    expect(booking.priceBreakdownVersion).toBe(1);
  });
});

describe("booking response deadline and delivery guarantees", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("expires an overdue request instead of allowing a stale host confirmation", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: new Date("2032-03-01"),
      checkOut: new Date("2032-03-04"),
      guestCount: 2,
    });
    await db.booking.update({
      where: { id: booking.id },
      data: { responseDueAt: new Date(Date.now() - 60_000) },
    });

    await expect(confirmBooking(booking.id, host.id)).rejects.toThrow(/expired/i);

    const [stored, hold, expiredDeliveries] = await Promise.all([
      db.booking.findUniqueOrThrow({ where: { id: booking.id } }),
      db.availabilityBlock.count({ where: { bookingId: booking.id } }),
      db.bookingEmailDelivery.count({
        where: { bookingId: booking.id, kind: "GUEST_EXPIRED" },
      }),
    ]);
    expect(stored.status).toBe("EXPIRED");
    expect(hold).toBe(0);
    expect(expiredDeliveries).toBe(1);
  });

  it("requires a reason before a host can decline a request", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: new Date("2032-04-01"),
      checkOut: new Date("2032-04-03"),
      guestCount: 1,
    });

    await expect(rejectBooking(booking.id, host.id, "  ")).rejects.toThrow(
      /reason is required/i
    );
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status
    ).toBe("PENDING");
  });

  it("creates exactly one durable delivery per initial recipient", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: new Date("2032-05-01"),
      checkOut: new Date("2032-05-03"),
      guestCount: 1,
    });
    const deliveries = await db.bookingEmailDelivery.findMany({
      where: { bookingId: booking.id },
      select: { kind: true },
      orderBy: { kind: "asc" },
    });

    expect(deliveries.map((delivery) => delivery.kind)).toEqual([
      "GUEST_REQUEST_RECEIVED",
      "HOST_NEW_REQUEST",
    ]);
  });
});

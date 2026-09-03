import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  setBookingModeForManagedListing,
  setChangeoverWeekdayForManagedListing,
  setStayLimitsForManagedListing,
  type ManagedFixedStayListing,
} from "@/lib/services/fixed-stay-mutation.service";
import {
  cleanupTestFixtures,
  createTestHostAndListing,
  type TestFixtures,
} from "@/lib/services/__tests__/test-helpers";

const fixtures: TestFixtures[] = [];

afterEach(async () => {
  while (fixtures.length > 0) {
    const fixture = fixtures.pop()!;
    await db.auditLog.deleteMany({
      where: { entityType: "Listing", entityId: fixture.listingId ?? undefined },
    });
    await cleanupTestFixtures(fixture);
  }
});

async function seed(mode: "FLEXIBLE" | "FIXED_STAYS" = "FLEXIBLE") {
  const { host, property, listing } = await createTestHostAndListing();
  fixtures.push({
    hostId: host.id,
    propertyId: property.id,
    listingId: listing.id,
    extraUserIds: [],
  });
  if (mode !== listing.bookingMode) {
    await db.listing.update({ where: { id: listing.id }, data: { bookingMode: mode } });
  }
  const managed: ManagedFixedStayListing = {
    id: listing.id,
    slug: listing.slug,
    status: listing.status,
    bookingMode: mode,
  };
  return { host, managed };
}

describe("weekly booking-rule writes", () => {
  it("refuses to activate Weekly when no whole week fits", async () => {
    const { host, managed } = await seed();
    await db.listing.update({
      where: { id: managed.id },
      data: { changeoverWeekday: "SATURDAY" },
    });
    await db.pricingRule.update({
      where: { listingId: managed.id },
      data: { minNights: 8, maxNights: 13 },
    });

    expect(
      await setBookingModeForManagedListing(managed, host.id, "FIXED_STAYS"),
    ).toEqual({
      error: "Adjust the minimum and maximum so at least one whole week can be booked.",
    });
    expect(
      await db.listing.findUniqueOrThrow({
        where: { id: managed.id },
        select: { bookingMode: true },
      }),
    ).toEqual({ bookingMode: "FLEXIBLE" });
  });

  it("refuses to activate Weekly before a changeover day exists", async () => {
    const { host, managed } = await seed();

    expect(
      await setBookingModeForManagedListing(managed, host.id, "FIXED_STAYS"),
    ).toEqual({
      error: "Choose a changeover day before turning on weekly stays.",
    });
    expect(
      await db.listing.findUniqueOrThrow({
        where: { id: managed.id },
        select: { bookingMode: true },
      }),
    ).toEqual({ bookingMode: "FLEXIBLE" });
  });

  it("refuses impossible limits on an active weekly listing", async () => {
    const { host, managed } = await seed("FIXED_STAYS");

    expect(
      await setStayLimitsForManagedListing(managed, host.id, {
        minNights: 8,
        maxNights: 13,
      }),
    ).toEqual({
      error: "Adjust the minimum and maximum so at least one whole week can be booked.",
    });
    expect(
      await db.pricingRule.findUniqueOrThrow({
        where: { listingId: managed.id },
        select: { minNights: true, maxNights: true },
      }),
    ).toEqual({ minNights: 1, maxNights: 365 });
  });

  it("does not let an active weekly listing lose its changeover day", async () => {
    const { host, managed } = await seed("FIXED_STAYS");
    await db.listing.update({
      where: { id: managed.id },
      data: { changeoverWeekday: "SATURDAY" },
    });

    expect(
      await setChangeoverWeekdayForManagedListing(managed, host.id, null),
    ).toEqual({ error: "A weekly listing must have a changeover day." });
    expect(
      await db.listing.findUniqueOrThrow({
        where: { id: managed.id },
        select: { changeoverWeekday: true },
      }),
    ).toEqual({ changeoverWeekday: "SATURDAY" });
  });

  it("can store the day before activating Weekly", async () => {
    const { host, managed } = await seed();

    expect(
      await setChangeoverWeekdayForManagedListing(managed, host.id, "SATURDAY"),
    ).toEqual({ success: true, changeoverWeekday: "SATURDAY" });
    expect(
      await setBookingModeForManagedListing(managed, host.id, "FIXED_STAYS"),
    ).toEqual({ success: true, bookingMode: "FIXED_STAYS" });
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { archiveOrDeleteListing } from "@/lib/services/listing.service";
import {
  createTestHostAndListing,
  createTestGuest,
  cleanupTestFixtures,
  type TestFixtures,
} from "./test-helpers";

describe("archiveOrDeleteListing", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("hard-deletes a listing that has never had a booking", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    fixtures = { hostId: host.id, propertyId: property.id, listingId: listing.id, extraUserIds: [] };

    const result = await archiveOrDeleteListing(listing.id, host.id);
    expect(result).toEqual({ outcome: "deleted" });

    const found = await db.listing.findUnique({ where: { id: listing.id } });
    expect(found).toBeNull();

    // Already deleted by the call above — tell cleanup not to touch the listing table.
    fixtures = { ...fixtures, listingId: null };
  });

  it("archives — never hard-deletes — a listing with booking history, and keeps the booking row", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const booking = await db.booking.create({
      data: {
        listingId: listing.id,
        guestId: guest.id,
        checkIn: new Date("2020-01-01"),
        checkOut: new Date("2020-01-05"),
        guestCount: 1,
        nightlyRate: 50,
        totalPrice: 200,
        numberOfNights: 4,
        status: "CANCELLED_BY_GUEST",
      },
    });

    const result = await archiveOrDeleteListing(listing.id, host.id);
    expect(result).toEqual({ outcome: "archived" });

    const listingRow = await db.listing.findUnique({ where: { id: listing.id } });
    expect(listingRow).not.toBeNull();
    expect(listingRow?.status).toBe("ARCHIVED");

    const bookingRow = await db.booking.findUnique({ where: { id: booking.id } });
    expect(bookingRow).not.toBeNull();
  });

  it("refuses to touch a listing with an active (PENDING/CONFIRMED) booking", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    await db.booking.create({
      data: {
        listingId: listing.id,
        guestId: guest.id,
        checkIn: new Date("2030-01-01"),
        checkOut: new Date("2030-01-05"),
        guestCount: 1,
        nightlyRate: 50,
        totalPrice: 200,
        numberOfNights: 4,
        status: "CONFIRMED",
      },
    });

    const result = await archiveOrDeleteListing(listing.id, host.id);
    expect(result).toHaveProperty("error");

    const listingRow = await db.listing.findUnique({ where: { id: listing.id } });
    expect(listingRow?.status).not.toBe("ARCHIVED");
  });
});

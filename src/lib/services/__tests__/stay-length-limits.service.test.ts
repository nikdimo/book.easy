import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { createBooking } from "@/lib/services/booking.service";
import { searchListings } from "@/lib/services/search.service";
import {
  createTestHostAndListing,
  createTestGuest,
  cleanupTestFixtures,
  type TestFixtures,
} from "./test-helpers";

/**
 * H1: `maxNights` was enforced only by `createBooking`, so a guest could search an
 * over-long stay, see the listing, watch the widget price every night of it, accept the
 * house rules and press request to book before anything mentioned the cap. These pin
 * both ends of the stay-length rule to the same answer in search and on the server.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function utcToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

const plusDays = (base: Date, days: number) =>
  new Date(base.getTime() + days * DAY_MS);

const ymd = (date: Date) => date.toISOString().slice(0, 10);

/** An open listing in a city of its own, so search assertions concern it alone. */
async function createListingWithStayLimits(limits: {
  minNights: number;
  maxNights: number;
}) {
  const { host, property, listing } = await createTestHostAndListing();
  const city = `Stay Limits ${randomUUID()}`;
  await db.property.update({ where: { id: property.id }, data: { city } });
  await db.pricingRule.update({
    where: { listingId: listing.id },
    data: limits,
  });
  return { host, property, listing, city };
}

describe("stay-length limits in search", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("keeps a listing for a stay of exactly its maximum and drops the night after", async () => {
    const { host, property, listing, city } = await createListingWithStayLimits({
      minNights: 2,
      maxNights: 14,
    });
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    };
    const base = plusDays(utcToday(), 30);

    const atCap = await searchListings({
      city,
      checkIn: ymd(base),
      checkOut: ymd(plusDays(base, 14)),
    });
    expect(atCap.listings.map((l) => l.id)).toContain(listing.id);

    const overCap = await searchListings({
      city,
      checkIn: ymd(base),
      checkOut: ymd(plusDays(base, 15)),
    });
    expect(overCap.listings.map((l) => l.id)).not.toContain(listing.id);
  });

  it("keeps a listing for a stay of exactly its minimum and drops the night before", async () => {
    const { host, property, listing, city } = await createListingWithStayLimits({
      minNights: 3,
      maxNights: 14,
    });
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    };
    const base = plusDays(utcToday(), 30);

    const atMinimum = await searchListings({
      city,
      checkIn: ymd(base),
      checkOut: ymd(plusDays(base, 3)),
    });
    expect(atMinimum.listings.map((l) => l.id)).toContain(listing.id);

    const belowMinimum = await searchListings({
      city,
      checkIn: ymd(base),
      checkOut: ymd(plusDays(base, 2)),
    });
    expect(belowMinimum.listings.map((l) => l.id)).not.toContain(listing.id);
  });

  it("treats a stored maximum of zero as no cap rather than as an unsellable listing", async () => {
    const { host, property, listing, city } = await createListingWithStayLimits({
      minNights: 1,
      maxNights: 0,
    });
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    };
    const base = plusDays(utcToday(), 30);

    const long = await searchListings({
      city,
      checkIn: ymd(base),
      checkOut: ymd(plusDays(base, 40)),
    });
    expect(long.listings.map((l) => l.id)).toContain(listing.id);
  });

  it("returns nothing for a range that is not a stay", async () => {
    const { host, property, listing, city } = await createListingWithStayLimits({
      minNights: 1,
      maxNights: 14,
    });
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    };
    const base = plusDays(utcToday(), 30);

    // Same day twice, and a check-out before its check-in: neither is bookable, so
    // neither may put a priced card in front of a guest.
    const zeroNight = await searchListings({
      city,
      checkIn: ymd(base),
      checkOut: ymd(base),
    });
    expect(zeroNight.listings).toHaveLength(0);

    const reversed = await searchListings({
      city,
      checkIn: ymd(plusDays(base, 5)),
      checkOut: ymd(base),
    });
    expect(reversed.listings).toHaveLength(0);
  });

  it("returns nothing for an impossible calendar date instead of normalizing it", async () => {
    const { host, property, listing, city } = await createListingWithStayLimits({
      minNights: 1,
      maxNights: 14,
    });
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    };

    const result = await searchListings({
      city,
      checkIn: "2027-02-30",
      checkOut: "2027-03-03",
    });

    expect(result.listings).toHaveLength(0);
  });
});

describe("stay-length limits on the server", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("accepts a stay of exactly the maximum and refuses the night after", async () => {
    const { host, property, listing } = await createListingWithStayLimits({
      minNights: 1,
      maxNights: 14,
    });
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    const base = plusDays(utcToday(), 30);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: base,
      checkOut: plusDays(base, 14),
      guestCount: 2,
    });
    expect(booking.id).toBeTruthy();

    await db.availabilityBlock.deleteMany({ where: { bookingId: booking.id } });
    await db.booking.delete({ where: { id: booking.id } });

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn: base,
        checkOut: plusDays(base, 15),
        guestCount: 2,
      }),
    ).rejects.toThrow(/Maximum stay is 14 nights/i);
  });

  it("refuses a stay one night under the minimum", async () => {
    const { host, property, listing } = await createListingWithStayLimits({
      minNights: 3,
      maxNights: 14,
    });
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    const base = plusDays(utcToday(), 30);

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn: base,
        checkOut: plusDays(base, 2),
        guestCount: 2,
      }),
    ).rejects.toThrow(/Minimum stay is 3 nights/i);
  });

  it("does not cap anything when the stored maximum is zero", async () => {
    const { host, property, listing } = await createListingWithStayLimits({
      minNights: 1,
      maxNights: 0,
    });
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    const base = plusDays(utcToday(), 30);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: base,
      checkOut: plusDays(base, 40),
      guestCount: 2,
    });
    expect(booking.id).toBeTruthy();
  });
});

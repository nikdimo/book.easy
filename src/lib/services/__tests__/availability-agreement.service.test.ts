import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import {
  checkAvailability,
  getBlockedDateRangesForListing,
} from "@/lib/services/availability.service";
import { createBooking } from "@/lib/services/booking.service";
import { searchListings } from "@/lib/services/search.service";
import { validateBookingSelection } from "@/lib/utils/booking-selection";
import {
  createTestHostAndListing,
  createTestGuest,
  cleanupTestFixtures,
  type TestFixtures,
} from "./test-helpers";

/**
 * C3: the calendar, search, `checkAvailability` and `createBooking` must answer the same
 * question the same way. Each case below asks all four about one stay and asserts they
 * agree — that being the property that was broken, rather than any single path's answer.
 *
 * The audit filed C3 as a critical guest-facing flow. That overstates today's exposure:
 * `submitNewListing` runs `mergeInclusiveBlockRanges` over the host's open ranges, so
 * the publish path cannot itself write two touching rows. What these tests pin down is
 * the rule for windows that arrive any other way — rows predating that merge, calendar
 * imports, admin or manual inserts, and any future writer that does not merge first —
 * and the fact that all four readers now share one answer for them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC midnight today, the convention the `@db.Date` columns round-trip. */
function utcToday(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

const plusDays = (base: Date, days: number) =>
  new Date(base.getTime() + days * DAY_MS);

const ymd = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Dates sit ~60 days out on purpose: far enough ahead to be bookable, and well inside
 * the calendar's 18-month horizon, past which every date is reported blocked regardless
 * of the windows.
 */
const BASE_OFFSET_DAYS = 60;

/**
 * A closed-by-default listing in a city of its own, so the search assertions can be made
 * against this listing alone rather than against whatever else the database holds.
 */
async function createClosedListing(windows: { start: Date; end: Date }[]) {
  const { host, property, listing } = await createTestHostAndListing();
  const city = `Availability Agreement ${randomUUID()}`;
  await db.property.update({ where: { id: property.id }, data: { city } });
  await db.listing.update({
    where: { id: listing.id },
    data: {
      availabilityMode: "CLOSED",
      availabilityWindows: {
        create: windows.map((window) => ({
          startDate: window.start,
          endDate: window.end,
        })),
      },
    },
  });
  return { host, property, listing, city };
}

/** What all four paths say about one stay on one listing. */
async function askEveryPath(input: {
  listingId: string;
  city: string;
  guestId: string;
  checkIn: Date;
  checkOut: Date;
}) {
  const { listingId, city, guestId, checkIn, checkOut } = input;

  const available = (await checkAvailability(listingId, checkIn, checkOut))
    .available;

  const searchIds = (
    await searchListings({
      city,
      checkIn: ymd(checkIn),
      checkOut: ymd(checkOut),
    })
  ).listings.map((listing) => listing.id);

  // The calendar's own output, read the way the booking widget reads it.
  const blockedRanges = await getBlockedDateRangesForListing(listingId);
  const calendarStatus = validateBookingSelection(
    checkIn,
    checkOut,
    1,
    blockedRanges,
  ).status;

  let booked = false;
  let bookingError: string | undefined;
  try {
    const booking = await createBooking({
      listingId,
      guestId,
      checkIn,
      checkOut,
      guestCount: 2,
    });
    booked = true;
    await db.availabilityBlock.deleteMany({ where: { bookingId: booking.id } });
    await db.booking.delete({ where: { id: booking.id } });
  } catch (error) {
    bookingError = String(error);
  }

  return {
    available,
    inSearch: searchIds.includes(listingId),
    calendarOffersIt: calendarStatus === "valid",
    booked,
    bookingError,
  };
}

describe("availability rule agreement across calendar, search, check and booking", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("allows a stay covered by two touching windows, everywhere", async () => {
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    // [base, base+14) and [base+14, base+28) — the second opens the day the first ends.
    const { host, property, listing, city } = await createClosedListing([
      { start: base, end: plusDays(base, 14) },
      { start: plusDays(base, 14), end: plusDays(base, 28) },
    ]);
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    // Straddles the seam: neither window spans it on its own.
    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: plusDays(base, 10),
      checkOut: plusDays(base, 20),
    });

    expect(answers.bookingError).toBeUndefined();
    expect(answers).toMatchObject({
      available: true,
      inSearch: true,
      calendarOffersIt: true,
      booked: true,
    });
  });

  it("refuses a stay crossing a real gap between windows, everywhere", async () => {
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    // [base, base+14) and [base+15, base+28) — day 14 is open in neither.
    const { host, property, listing, city } = await createClosedListing([
      { start: base, end: plusDays(base, 14) },
      { start: plusDays(base, 15), end: plusDays(base, 28) },
    ]);
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: plusDays(base, 10),
      checkOut: plusDays(base, 20),
    });

    expect(answers).toMatchObject({
      available: false,
      inSearch: false,
      calendarOffersIt: false,
      booked: false,
    });
    expect(answers.bookingError).toMatch(/not open for booking/i);
  });

  it("still sells the nights on either side of a gap", async () => {
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    const { host, property, listing, city } = await createClosedListing([
      { start: base, end: plusDays(base, 14) },
      { start: plusDays(base, 15), end: plusDays(base, 28) },
    ]);
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: plusDays(base, 16),
      checkOut: plusDays(base, 20),
    });

    expect(answers).toMatchObject({
      available: true,
      inSearch: true,
      calendarOffersIt: true,
      booked: true,
    });
  });

  it("allows a stay running the exact length of the merged span", async () => {
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    const { host, property, listing, city } = await createClosedListing([
      { start: base, end: plusDays(base, 14) },
      { start: plusDays(base, 14), end: plusDays(base, 28) },
    ]);
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: base,
      checkOut: plusDays(base, 28),
    });

    expect(answers).toMatchObject({
      available: true,
      inSearch: true,
      calendarOffersIt: true,
      booked: true,
    });
  });

  it("refuses a stay running one night past the end of the merged span", async () => {
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    const { host, property, listing, city } = await createClosedListing([
      { start: base, end: plusDays(base, 14) },
      { start: plusDays(base, 14), end: plusDays(base, 28) },
    ]);
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: plusDays(base, 25),
      checkOut: plusDays(base, 29),
    });

    expect(answers).toMatchObject({
      available: false,
      inSearch: false,
      calendarOffersIt: false,
      booked: false,
    });
  });

  it("refuses a stay starting the day before the windows open", async () => {
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    const { host, property, listing, city } = await createClosedListing([
      { start: base, end: plusDays(base, 14) },
      { start: plusDays(base, 14), end: plusDays(base, 28) },
    ]);
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: plusDays(base, -1),
      checkOut: plusDays(base, 5),
    });

    expect(answers).toMatchObject({
      available: false,
      inSearch: false,
      calendarOffersIt: false,
      booked: false,
    });
  });
});

describe("concurrent booking against a listing opened by touching windows", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("still lets only one of two simultaneous requests through", async () => {
    // The union rule widens what may be booked; it must not widen what may be
    // double-booked. The advisory lock and the AvailabilityBlock exclusion constraint
    // are untouched, and this holds them to it across the window seam.
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    const { host, property, listing } = await createClosedListing([
      { start: base, end: plusDays(base, 14) },
      { start: plusDays(base, 14), end: plusDays(base, 28) },
    ]);
    const guestA = await createTestGuest();
    const guestB = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guestA.id, guestB.id],
    };

    const checkIn = plusDays(base, 10);
    const checkOut = plusDays(base, 20);

    const results = await Promise.allSettled([
      createBooking({
        listingId: listing.id,
        guestId: guestA.id,
        checkIn,
        checkOut,
        guestCount: 2,
      }),
      createBooking({
        listingId: listing.id,
        guestId: guestB.id,
        checkIn,
        checkOut,
        guestCount: 2,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toMatch(/no longer available/i);
  });

  it("refuses a second stay that only overlaps across the seam", async () => {
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    const { host, property, listing } = await createClosedListing([
      { start: base, end: plusDays(base, 14) },
      { start: plusDays(base, 14), end: plusDays(base, 28) },
    ]);
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
      checkIn: plusDays(base, 10),
      checkOut: plusDays(base, 20),
      guestCount: 2,
    });

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guestB.id,
        checkIn: plusDays(base, 18),
        checkOut: plusDays(base, 24),
        guestCount: 2,
      }),
    ).rejects.toThrow(/no longer available/i);
  });
});

import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { getBlockedDateRangesForListing } from "@/lib/services/availability.service";
import { createBooking } from "@/lib/services/booking.service";
import { searchListings } from "@/lib/services/search.service";
import { validateBookingSelection } from "@/lib/utils/booking-selection";
import { todayYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  createTestHostAndListing,
  createTestGuest,
  cleanupTestFixtures,
  type TestFixtures,
} from "./test-helpers";

/**
 * C3: the calendar, search and `createBooking` must answer the same question the same
 * way. Each case below asks all three about one stay and asserts they agree — that being
 * the property that was broken, rather than any single path's answer.
 *
 * There used to be a fourth leg, `checkAvailability`, which had no production callers at
 * all (#5) and has been deleted. Asking it here made the suite look broader than it was:
 * three of the four answers were live and one was a function nothing shipped.
 *
 * The audit filed C3 as a critical guest-facing flow. That overstates today's exposure:
 * `submitNewListing` runs `mergeInclusiveBlockRanges` over the host's open ranges, so
 * the publish path cannot itself write two touching rows. What these tests pin down is
 * the rule for windows that arrive any other way — rows predating that merge, calendar
 * imports, admin or manual inserts, and any future writer that does not merge first —
 * and the fact that all four readers now share one answer for them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Marketplace today, stored as the UTC-midnight spelling used by `@db.Date`. */
function utcToday(): Date {
  return ymdToDbDate(todayYmd());
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

/** What all three live paths say about one stay on one listing. */
async function askEveryPath(input: {
  listingId: string;
  city: string;
  guestId: string;
  checkIn: Date;
  checkOut: Date;
  /** The listing's own limits, so the calendar leg is asked the same question. */
  minNights?: number;
  maxNights?: number;
}) {
  const { listingId, city, guestId, checkIn, checkOut } = input;

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
    input.minNights ?? 1,
    blockedRanges,
    input.maxNights,
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
      inSearch: false,
      calendarOffersIt: false,
      booked: false,
    });
  });
});

/**
 * #4: the two cells this suite never asked, which is how the gap stayed invisible.
 *
 * `decideStayAvailability` returned from its flexible branch before consulting `limits`
 * and before the past-date check, and the suite only ever exercised windows. The booking
 * path happened to hold — `createBooking` re-implemented the limits and the action-layer
 * Zod refinement re-implemented the past-date rule — but search built its flexible arm
 * without the past-date rule at all.
 *
 * A listing with an OPEN calendar here on purpose: these are listing-wide rules, and
 * they must refuse a stay that no window is standing in the way of.
 */
describe("flexible listings agree on stay limits and past dates", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function createOpenListing(limits: { minNights: number; maxNights: number }) {
    const { host, property, listing } = await createTestHostAndListing();
    const city = `Availability Agreement ${randomUUID()}`;
    await db.property.update({ where: { id: property.id }, data: { city } });
    await db.pricingRule.update({
      where: { listingId: listing.id },
      data: limits,
    });
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    return { listing, city, guest };
  }

  it("offers a stay inside the limits, everywhere", async () => {
    const { listing, city, guest } = await createOpenListing({
      minNights: 3,
      maxNights: 14,
    });
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: base,
      checkOut: plusDays(base, 7),
      minNights: 3,
      maxNights: 14,
    });
    expect(answers.bookingError).toBeUndefined();
    expect(answers).toMatchObject({
      inSearch: true,
      calendarOffersIt: true,
      booked: true,
    });
  });

  it("refuses a stay under the minimum, everywhere", async () => {
    const { listing, city, guest } = await createOpenListing({
      minNights: 5,
      maxNights: 14,
    });
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: base,
      checkOut: plusDays(base, 2),
      minNights: 5,
      maxNights: 14,
    });
    expect(answers).toMatchObject({
      inSearch: false,
      calendarOffersIt: false,
      booked: false,
    });
    expect(answers.bookingError).toMatch(/minimum stay is 5 nights/i);
  });

  it("refuses a stay over the maximum, everywhere", async () => {
    const { listing, city, guest } = await createOpenListing({
      minNights: 1,
      maxNights: 7,
    });
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: base,
      checkOut: plusDays(base, 10),
      minNights: 1,
      maxNights: 7,
    });
    expect(answers).toMatchObject({
      inSearch: false,
      calendarOffersIt: false,
      booked: false,
    });
    expect(answers.bookingError).toMatch(/maximum stay is 7 nights/i);
  });

  it("treats a stored maximum of 0 as no cap, everywhere", async () => {
    const { listing, city, guest } = await createOpenListing({
      minNights: 1,
      maxNights: 0,
    });
    const base = plusDays(utcToday(), BASE_OFFSET_DAYS);
    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: base,
      checkOut: plusDays(base, 60),
      minNights: 1,
      maxNights: 0,
    });
    expect(answers.bookingError).toBeUndefined();
    expect(answers).toMatchObject({
      inSearch: true,
      calendarOffersIt: true,
      booked: true,
    });
  });

  /**
   * The past-date cell. Asked of the three *server* paths only: the guest calendar's
   * blocked ranges start at today by construction, so past-ness is expressed there by
   * the picker's own floor rather than by this data, and asking `validateBookingSelection`
   * about it would be asking a question it is not the answer to.
   */
  it("refuses a stay whose check-in has gone by, on every server path", async () => {
    const { listing, city, guest } = await createOpenListing({
      minNights: 1,
      maxNights: 30,
    });
    const base = plusDays(utcToday(), -5);
    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: base,
      checkOut: plusDays(base, 3),
    });
    expect(answers.inSearch).toBe(false);
    expect(answers.booked).toBe(false);
    expect(answers.bookingError).toMatch(/check-in date cannot be in the past/i);
  });

  /** Today is not the past, and a same-day stay stays bookable. */
  it("still offers a stay beginning today", async () => {
    const { listing, city, guest } = await createOpenListing({
      minNights: 1,
      maxNights: 30,
    });
    const base = utcToday();
    const answers = await askEveryPath({
      listingId: listing.id,
      city,
      guestId: guest.id,
      checkIn: base,
      checkOut: plusDays(base, 3),
    });
    expect(answers.inSearch).toBe(true);
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

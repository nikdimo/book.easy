import { afterEach, describe, expect, it, vi } from "vitest";

// The workspace resolves the host's display currency on the way out, which reads a
// cookie and an `unstable_cache` — neither of which exists outside a request. Neither is
// what this file is about: display money never touches what a listing is priced in.
vi.mock("@/lib/currency/server", () => ({
  getDisplayCurrency: async () => "EUR",
}));
vi.mock("@/lib/currency/rates", () => ({
  getExchangeRates: async () => null,
}));

import { db } from "@/lib/db";
import {
  getHostCalendarListingContext,
  getHostCalendarWorkspace,
} from "@/lib/services/host-calendar-workspace.service";
import { todayYmd, addDaysToYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * What the host calendar is handed about a listing that sells whole stays.
 *
 * The panel and the grid both read this payload, so the states have to be the server's —
 * derived by the same projection the mutations re-check against — and the query has to
 * stay one pass over the host's listings rather than one per stay.
 */

const fixtures: TestFixtures[] = [];

afterEach(async () => {
  while (fixtures.length > 0) {
    await cleanupTestFixtures(fixtures.pop()!);
  }
});

const day = (offset: number) => addDaysToYmd(todayYmd(), offset);

async function seed(bookingMode: "FLEXIBLE" | "FIXED_STAYS" = "FIXED_STAYS") {
  const { host, property, listing } = await createTestHostAndListing();
  const guest = await createTestGuest();
  fixtures.push({
    hostId: host.id,
    propertyId: property.id,
    listingId: listing.id,
    extraUserIds: [guest.id],
  });
  await db.listing.update({ where: { id: listing.id }, data: { bookingMode } });
  return { hostId: host.id, listingId: listing.id, guestId: guest.id };
}

const addPeriod = (listingId: string, checkIn: string, checkOut: string) =>
  db.listingFixedStayPeriod.create({
    data: {
      listingId,
      checkIn: ymdToDbDate(checkIn),
      checkOut: ymdToDbDate(checkOut),
    },
    select: { id: true },
  });

const contextFor = async (hostId: string, listingId: string) => {
  const context = await getHostCalendarListingContext(listingId, hostId, "en");
  if (!context) throw new Error("no context");
  return context;
};

describe("the calendar payload", () => {
  it("carries the listing's booking mode", async () => {
    const fixed = await seed("FIXED_STAYS");
    const flexible = await seed("FLEXIBLE");

    expect(
      (await contextFor(fixed.hostId, fixed.listingId)).listing.bookingMode,
    ).toBe("FIXED_STAYS");
    expect(
      (await contextFor(flexible.hostId, flexible.listingId)).listing.bookingMode,
    ).toBe("FLEXIBLE");
  });

  it("carries each stay with its derived length and state", async () => {
    const { hostId, listingId } = await seed();
    await addPeriod(listingId, day(30), day(37));
    await addPeriod(listingId, day(60), day(74));

    const { listing } = await contextFor(hostId, listingId);
    expect(
      listing.fixedStayPeriods.map((period) => [
        period.checkIn,
        period.nights,
        period.state,
        period.manageable,
      ]),
    ).toEqual([
      [day(30), 7, "AVAILABLE", true],
      [day(60), 14, "AVAILABLE", true],
    ]);
  });

  it("keeps a fully past stay visible and locked for history", async () => {
    const { hostId, listingId } = await seed();
    await addPeriod(listingId, day(-14), day(-7));

    const { listing } = await contextFor(hostId, listingId);
    expect(listing.fixedStayPeriods).toEqual([
      expect.objectContaining({
        checkIn: day(-14),
        checkOut: day(-7),
        state: "PAST",
        manageable: false,
      }),
    ]);
  });

  it("marks a switched-off stay DISABLED and still manageable", async () => {
    const { hostId, listingId } = await seed();
    const period = await addPeriod(listingId, day(30), day(37));
    await db.listingFixedStayPeriod.update({
      where: { id: period.id },
      data: { disabledAt: new Date() },
    });

    const { listing } = await contextFor(hostId, listingId);
    expect(listing.fixedStayPeriods[0].state).toBe("DISABLED");
    expect(listing.fixedStayPeriods[0].manageable).toBe(true);
  });

  it("marks a stay an active booking was sold as BOOKED and locked", async () => {
    const { hostId, listingId, guestId } = await seed();
    const period = await addPeriod(listingId, day(30), day(37));
    const booking = await db.booking.create({
      data: {
        listingId,
        guestId,
        checkIn: ymdToDbDate(day(30)),
        checkOut: ymdToDbDate(day(37)),
        guestCount: 2,
        adults: 2,
        numberOfNights: 7,
        nightlyRate: 50,
        cleaningFee: 10,
        serviceFee: 0,
        totalPrice: 360,
        status: "CONFIRMED",
        fixedStayPeriodId: period.id,
      },
      select: { id: true },
    });
    // The hold is the row the calendar actually reads the booking through.
    await db.availabilityBlock.create({
      data: {
        listingId,
        startDate: ymdToDbDate(day(30)),
        endDate: ymdToDbDate(day(37)),
        blockType: "BOOKING_HOLD",
        bookingId: booking.id,
      },
    });

    const { listing } = await contextFor(hostId, listingId);
    expect(listing.fixedStayPeriods[0].state).toBe("BOOKED");
    expect(listing.fixedStayPeriods[0].manageable).toBe(false);
  });

  it("marks a stay whose nights something else holds DATES_TAKEN, still manageable", async () => {
    const { hostId, listingId } = await seed();
    await addPeriod(listingId, day(30), day(37));
    await db.availabilityBlock.create({
      data: {
        listingId,
        startDate: ymdToDbDate(day(32)),
        endDate: ymdToDbDate(day(34)),
        blockType: "MANUAL_BLOCK",
      },
    });

    const { listing } = await contextFor(hostId, listingId);
    expect(listing.fixedStayPeriods[0].state).toBe("DATES_TAKEN");
    // Something else holds those nights; nobody booked *this*, so the host may still
    // withdraw or move it.
    expect(listing.fixedStayPeriods[0].manageable).toBe(true);
  });

  it("keeps a flexible listing's stored stays in the payload", async () => {
    // A listing that switched back still owns them, and switching forward again must
    // restore exactly what the host built.
    const { hostId, listingId } = await seed("FLEXIBLE");
    await addPeriod(listingId, day(30), day(37));

    const { listing } = await contextFor(hostId, listingId);
    expect(listing.bookingMode).toBe("FLEXIBLE");
    expect(listing.fixedStayPeriods).toHaveLength(1);
  });

  it("carries no guest name or block reason on a stay", async () => {
    const { hostId, listingId } = await seed();
    await addPeriod(listingId, day(30), day(37));
    await db.availabilityBlock.create({
      data: {
        listingId,
        startDate: ymdToDbDate(day(32)),
        endDate: ymdToDbDate(day(34)),
        blockType: "MANUAL_BLOCK",
        reason: "Private note the panel must never print",
      },
    });

    const { listing } = await contextFor(hostId, listingId);
    expect(JSON.stringify(listing.fixedStayPeriods)).not.toContain("Private note");
    expect(Object.keys(listing.fixedStayPeriods[0]).sort()).toEqual([
      "checkIn",
      "checkOut",
      "id",
      "manageable",
      "nights",
      "state",
    ]);
  });
});

describe("ownership", () => {
  it("refuses a listing this host does not own", async () => {
    const mine = await seed();
    const theirs = await seed();

    expect(
      await getHostCalendarListingContext(theirs.listingId, mine.hostId, "en"),
    ).toBeNull();
  });

  it("carries only this host's listings into the workspace", async () => {
    const mine = await seed();
    const theirs = await seed();
    await addPeriod(theirs.listingId, day(30), day(37));

    const workspace = await getHostCalendarWorkspace(mine.hostId, "en");
    expect(workspace.listings.map((listing) => listing.id)).toEqual([
      mine.listingId,
    ]);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createBooking,
  LEGACY_PERIOD_REQUEST_ERROR,
  NO_CHANGEOVER_DAY_ERROR,
} from "@/lib/services/booking.service";
import { checkAvailability } from "@/lib/services/availability.service";
import { addDaysToYmd, dbDateToYmd, todayYmd, weekdayOfYmd, ymdToDbDate } from "@/lib/utils/date-only";
import { computeStayQuote, parseLocalYmd } from "@/lib/utils/stay-pricing";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * Booking a weekly stay, against the real local Postgres (see vitest.config.ts).
 *
 * The server is the only authority here, which is the point of testing it directly: the
 * guest calendar can refuse a Tuesday, but a crafted payload reaches this function, and
 * this function is what has to say no. Availability is deliberately exercised through the
 * ordinary `AvailabilityBlock` rows rather than through anything weekly-specific — a
 * blocked night is a blocked night in both booking modes.
 */

/** Far enough out that the marketplace's real "today" can never reach it. */
const SAT_1 = "2029-06-09";
const SAT_2 = "2029-06-16";
const SAT_3 = "2029-06-23";
const SAT_4 = "2029-06-30";
const SAT_5 = "2029-07-07";

const fixtures: TestFixtures[] = [];

afterEach(async () => {
  while (fixtures.length > 0) await cleanupTestFixtures(fixtures.pop()!);
});

async function seed(options: {
  bookingMode?: "FLEXIBLE" | "FIXED_STAYS";
  changeoverWeekday?:
    | "MONDAY"
    | "TUESDAY"
    | "WEDNESDAY"
    | "THURSDAY"
    | "FRIDAY"
    | "SATURDAY"
    | "SUNDAY"
    | null;
  minNights?: number;
  maxNights?: number;
  availabilityMode?: "OPEN" | "CLOSED";
  extraGuests?: number;
} = {}) {
  const { host, property, listing } = await createTestHostAndListing();
  const guests = await Promise.all(
    Array.from({ length: 1 + (options.extraGuests ?? 0) }, () => createTestGuest()),
  );
  fixtures.push({
    hostId: host.id,
    propertyId: property.id,
    listingId: listing.id,
    extraUserIds: guests.map((guest) => guest.id),
  });

  await db.listing.update({
    where: { id: listing.id },
    data: {
      bookingMode: options.bookingMode ?? "FIXED_STAYS",
      changeoverWeekday:
        options.changeoverWeekday === undefined
          ? "SATURDAY"
          : options.changeoverWeekday,
      availabilityMode: options.availabilityMode ?? "OPEN",
    },
  });
  await db.pricingRule.update({
    where: { listingId: listing.id },
    data: {
      minNights: options.minNights ?? 1,
      maxNights: options.maxNights ?? 30,
    },
  });
  return { host, listing, guest: guests[0], guests };
}

const book = (
  listingId: string,
  guestId: string,
  checkIn: string,
  checkOut: string,
) =>
  createBooking({
    listingId,
    guestId,
    checkIn: ymdToDbDate(checkIn),
    checkOut: ymdToDbDate(checkOut),
    guestCount: 2,
  });

const addBlock = (
  listingId: string,
  startYmd: string,
  endYmd: string,
  blockType: "MANUAL_BLOCK" | "EXTERNAL_SYNC" | "BOOKING_HOLD" = "MANUAL_BLOCK",
) =>
  db.availabilityBlock.create({
    data: {
      listingId,
      startDate: ymdToDbDate(startYmd),
      endDate: ymdToDbDate(endYmd),
      blockType,
    },
  });

const addWindow = (listingId: string, startYmd: string, endYmd: string) =>
  db.listingAvailabilityWindow.create({
    data: {
      listingId,
      startDate: ymdToDbDate(startYmd),
      endDate: ymdToDbDate(endYmd),
    },
  });

const bookingCount = (listingId: string) =>
  db.booking.count({ where: { listingId } });

// ─── The shape of a weekly stay ─────────────────────────────────────────────────

describe("booking a weekly stay", () => {
  it("takes a whole week that starts and ends on the changeover day", async () => {
    const { listing, guest } = await seed();
    const booking = await book(listing.id, guest.id, SAT_1, SAT_2);

    expect(dbDateToYmd(booking.checkIn)).toBe(SAT_1);
    expect(dbDateToYmd(booking.checkOut)).toBe(SAT_2);
    expect(booking.numberOfNights).toBe(7);
    expect(booking.status).toBe("PENDING");
  });

  it.each([
    ["two weeks", SAT_3, 14],
    ["three weeks", SAT_4, 21],
    ["four weeks", SAT_5, 28],
  ])("takes %s inside the maximum", async (_label, checkOut, nights) => {
    const { listing, guest } = await seed();
    const booking = await book(listing.id, guest.id, SAT_1, checkOut);
    expect(booking.numberOfNights).toBe(nights);
  });

  it("stores no period pointer or snapshot — a weekly booking is just dates", async () => {
    const { listing, guest } = await seed();
    const booking = await book(listing.id, guest.id, SAT_1, SAT_2);
    expect(booking.fixedStayPeriodId).toBeNull();
    expect(booking.fixedStaySnapshot).toBeNull();
  });

  it("holds exactly the nights of the stay", async () => {
    const { listing, guest } = await seed();
    const booking = await book(listing.id, guest.id, SAT_1, SAT_2);
    const hold = await db.availabilityBlock.findFirstOrThrow({
      where: { bookingId: booking.id, blockType: "BOOKING_HOLD" },
    });
    expect(dbDateToYmd(hold.startDate)).toBe(SAT_1);
    expect(dbDateToYmd(hold.endDate)).toBe(SAT_2);
  });

  it("works on every weekday a host might change over on", async () => {
    // 2029-06-10 is a Sunday, so +n lands on weekday n.
    const days = [
      ["SUNDAY", "2029-06-10"],
      ["MONDAY", "2029-06-11"],
      ["TUESDAY", "2029-06-12"],
      ["WEDNESDAY", "2029-06-13"],
      ["THURSDAY", "2029-06-14"],
      ["FRIDAY", "2029-06-15"],
      ["SATURDAY", "2029-06-16"],
    ] as const;
    for (const [weekday, checkIn] of days) {
      const { listing, guest } = await seed({ changeoverWeekday: weekday });
      const booking = await book(
        listing.id,
        guest.id,
        checkIn,
        addDaysToYmd(checkIn, 7),
      );
      expect(booking.numberOfNights, weekday).toBe(7);
    }
  });
});

describe("a weekly stay of the wrong shape", () => {
  it("refuses a check-in on any other weekday", async () => {
    const { listing, guest } = await seed();
    await expect(
      book(listing.id, guest.id, "2029-06-10", "2029-06-17"),
    ).rejects.toThrow(/Check-in must be on a Saturday/);
    expect(await bookingCount(listing.id)).toBe(0);
  });

  it("refuses a checkout that is not a whole number of weeks away", async () => {
    const { listing, guest } = await seed();
    await expect(
      book(listing.id, guest.id, SAT_1, "2029-06-15"),
    ).rejects.toThrow(/check-out must also be on a Saturday/);
    await expect(
      book(listing.id, guest.id, SAT_1, "2029-06-17"),
    ).rejects.toThrow(/check-out must also be on a Saturday/);
    expect(await bookingCount(listing.id)).toBe(0);
  });

  it("refuses a stay below the listing's minimum", async () => {
    const { listing, guest } = await seed({ minNights: 10 });
    await expect(book(listing.id, guest.id, SAT_1, SAT_2)).rejects.toThrow(
      /shorter than this host's minimum/,
    );
    // Two weeks clears a ten-night minimum.
    expect((await book(listing.id, guest.id, SAT_1, SAT_3)).numberOfNights).toBe(14);
  });

  it("refuses a stay above the listing's maximum", async () => {
    const { listing, guest } = await seed({ maxNights: 30 });
    await expect(
      book(listing.id, guest.id, SAT_1, "2029-07-14"),
    ).rejects.toThrow(/longer than this host's maximum/);
  });

  it("honours a maximum that is not a multiple of seven", async () => {
    const { listing, guest } = await seed({ maxNights: 13 });
    // One week fits inside 13 nights; two weeks do not.
    expect((await book(listing.id, guest.id, SAT_1, SAT_2)).numberOfNights).toBe(7);
    const second = await seed({ maxNights: 13 });
    await expect(
      book(second.listing.id, second.guest.id, SAT_1, SAT_3),
    ).rejects.toThrow(/longer than this host's maximum/);
  });

  it("fails closed when the host has not chosen a changeover day", async () => {
    const { listing, guest } = await seed({ changeoverWeekday: null });
    await expect(book(listing.id, guest.id, SAT_1, SAT_2)).rejects.toThrow(
      NO_CHANGEOVER_DAY_ERROR,
    );
    expect(await bookingCount(listing.id)).toBe(0);
  });
});

// ─── Availability still decides ─────────────────────────────────────────────────

describe("availability overrides the weekly rule", () => {
  it.each(["MANUAL_BLOCK", "EXTERNAL_SYNC"] as const)(
    "refuses a week containing a %s night",
    async (blockType) => {
      const { listing, guest } = await seed();
      // One night in the middle of the week.
      await addBlock(listing.id, "2029-06-11", "2029-06-12", blockType);
      await expect(book(listing.id, guest.id, SAT_1, SAT_2)).rejects.toThrow(
        /no longer available/i,
      );
    },
  );

  it("refuses a week overlapping an existing booking", async () => {
    const { listing, guests } = await seed({ extraGuests: 1 });
    await book(listing.id, guests[0].id, SAT_1, SAT_2);
    await expect(book(listing.id, guests[1].id, SAT_1, SAT_2)).rejects.toThrow(
      /no longer available/i,
    );
  });

  it("refuses a fortnight whose second week is already taken", async () => {
    const { listing, guests } = await seed({ extraGuests: 1 });
    await book(listing.id, guests[0].id, SAT_2, SAT_3);
    await expect(book(listing.id, guests[1].id, SAT_1, SAT_3)).rejects.toThrow(
      /no longer available/i,
    );
  });

  it("lets back-to-back weeks both be booked — a checkout is not a night", async () => {
    const { listing, guests } = await seed({ extraGuests: 1 });
    const first = await book(listing.id, guests[0].id, SAT_1, SAT_2);
    const second = await book(listing.id, guests[1].id, SAT_2, SAT_3);
    expect(first.id).not.toBe(second.id);
    expect(await bookingCount(listing.id)).toBe(2);
  });

  it("allows a block that ends on the check-in day", async () => {
    const { listing, guest } = await seed();
    await addBlock(listing.id, "2029-06-02", SAT_1);
    expect((await book(listing.id, guest.id, SAT_1, SAT_2)).numberOfNights).toBe(7);
  });

  it("allows a block that starts on the checkout day", async () => {
    const { listing, guest } = await seed();
    await addBlock(listing.id, SAT_2, SAT_3);
    expect((await book(listing.id, guest.id, SAT_1, SAT_2)).numberOfNights).toBe(7);
  });

  it("refuses a weekly stay outside a CLOSED calendar's open windows", async () => {
    const { listing, guest } = await seed({ availabilityMode: "CLOSED" });
    await expect(book(listing.id, guest.id, SAT_1, SAT_2)).rejects.toThrow(
      /not open for booking/i,
    );
  });

  it("accepts a weekly stay covered by adjacent open windows", async () => {
    const { listing, guest } = await seed({ availabilityMode: "CLOSED" });
    await addWindow(listing.id, "2029-06-01", "2029-06-12");
    await addWindow(listing.id, "2029-06-12", "2029-06-20");
    expect((await book(listing.id, guest.id, SAT_1, SAT_2)).numberOfNights).toBe(7);
  });
});

// ─── Bypass attempts ────────────────────────────────────────────────────────────

describe("payloads that try to get around the rule", () => {
  it("refuses a request still carrying a legacy period id", async () => {
    const { listing, guest } = await seed();
    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        fixedStayPeriodId: "any-period",
        guestCount: 2,
      } as unknown as Parameters<typeof createBooking>[0]),
    ).rejects.toThrow(LEGACY_PERIOD_REQUEST_ERROR);
    expect(await bookingCount(listing.id)).toBe(0);
  });

  it("refuses a request naming no dates at all", async () => {
    const { listing, guest } = await seed();
    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        guestCount: 2,
      } as unknown as Parameters<typeof createBooking>[0]),
    ).rejects.toThrow(/Choose your dates/);
  });

  it("cannot be talked into a wrong-weekday stay by a direct service call", async () => {
    const { listing, guest } = await seed();
    // Exactly what a crafted form post would reach the service as.
    await expect(
      book(listing.id, guest.id, "2029-06-11", "2029-06-18"),
    ).rejects.toThrow(/Check-in must be on a Saturday/);
    expect(await bookingCount(listing.id)).toBe(0);
  });

  it("leaves nothing behind when it refuses", async () => {
    const { listing, guest } = await seed();
    await expect(
      book(listing.id, guest.id, SAT_1, "2029-06-13"),
    ).rejects.toThrow();
    expect(await bookingCount(listing.id)).toBe(0);
    expect(
      await db.availabilityBlock.count({
        where: { listingId: listing.id, blockType: "BOOKING_HOLD" },
      }),
    ).toBe(0);
    expect(
      await db.bookingTimelineEvent.count({
        where: { booking: { listingId: listing.id } },
      }),
    ).toBe(0);
  });
});

// ─── Pricing, and the flexible path ─────────────────────────────────────────────

describe("what a weekly stay costs", () => {
  it("uses the listing's ordinary nightly rate and cleaning fee", async () => {
    const { listing, guest } = await seed();
    const booking = await book(listing.id, guest.id, SAT_1, SAT_2);
    // The fixture: 50 a night, 10 cleaning. Seven nights.
    expect(Number(booking.totalPrice)).toBe(7 * 50 + 10);
  });

  it("uses date-specific prices inside the week", async () => {
    const { listing, guest } = await seed();
    await db.listingDatePrice.create({
      data: {
        listingId: listing.id,
        date: ymdToDbDate("2029-06-11"),
        nightlyRate: 150,
      },
    });
    const booking = await book(listing.id, guest.id, SAT_1, SAT_2);
    expect(Number(booking.totalPrice)).toBe(6 * 50 + 150 + 10);
  });

  it("matches the shared quote engine exactly", async () => {
    const { listing, guest } = await seed();
    const booking = await book(listing.id, guest.id, SAT_1, SAT_3);
    const expected = computeStayQuote({
      baseNightly: 50,
      cleaningFee: 10,
      checkIn: parseLocalYmd(SAT_1),
      checkOut: parseLocalYmd(SAT_3),
      overrides: new Map(),
      promotions: [],
    });
    expect(Number(booking.totalPrice)).toBe(expected.total);
    const breakdown = booking.priceBreakdown as Record<string, unknown>;
    expect(breakdown.finalTotal).toBe(expected.total);
    expect((breakdown.nights as unknown[]).length).toBe(14);
  });

  it("applies the listing's promotions on the same terms", async () => {
    const { listing, guest } = await seed();
    await db.listingPromotion.create({
      data: {
        listingId: listing.id,
        type: "PERCENT_DISCOUNT",
        discountPercent: 10,
        minimumNights: 7,
      },
    });
    const booking = await book(listing.id, guest.id, SAT_1, SAT_2);
    expect(Number(booking.discountAmount)).toBeGreaterThan(0);
    expect(Number(booking.totalPrice)).toBeLessThan(7 * 50 + 10);
  });
});

describe("flexible listings are unchanged", () => {
  it("still takes any length inside its limits, on any weekday", async () => {
    const { listing, guest } = await seed({ bookingMode: "FLEXIBLE" });
    // A Tuesday-to-Friday stay: three nights, no weekday rule in sight.
    const booking = await book(listing.id, guest.id, "2029-06-12", "2029-06-15");
    expect(booking.numberOfNights).toBe(3);
    expect(booking.fixedStayPeriodId).toBeNull();
  });

  it("still enforces its own minimum and maximum stay", async () => {
    const { listing, guest } = await seed({
      bookingMode: "FLEXIBLE",
      minNights: 5,
      maxNights: 10,
    });
    await expect(
      book(listing.id, guest.id, "2029-06-12", "2029-06-15"),
    ).rejects.toThrow(/Minimum stay is 5 nights/);
    await expect(
      book(listing.id, guest.id, "2029-06-12", "2029-06-30"),
    ).rejects.toThrow(/Maximum stay is 10 nights/);
  });

  it("still refuses dates outside its availability windows", async () => {
    const { listing, guest } = await seed({
      bookingMode: "FLEXIBLE",
      availabilityMode: "CLOSED",
    });
    await expect(book(listing.id, guest.id, SAT_1, SAT_2)).rejects.toThrow(
      /not open for booking/i,
    );
  });
});

// ─── The shared availability read ───────────────────────────────────────────────

describe("checkAvailability follows the same rule", () => {
  it("agrees with the booking path on a weekly listing", async () => {
    const { listing } = await seed();
    expect(
      (
        await checkAvailability(
          listing.id,
          ymdToDbDate(SAT_1),
          ymdToDbDate(SAT_2),
        )
      ).available,
    ).toBe(true);
    // Wrong weekday.
    expect(
      (
        await checkAvailability(
          listing.id,
          ymdToDbDate("2029-06-10"),
          ymdToDbDate("2029-06-17"),
        )
      ).available,
    ).toBe(false);
    // Over the maximum.
    expect(
      (
        await checkAvailability(
          listing.id,
          ymdToDbDate(SAT_1),
          ymdToDbDate("2029-07-14"),
        )
      ).available,
    ).toBe(false);
  });

  it("reports a blocked night as unavailable", async () => {
    const { listing } = await seed();
    await addBlock(listing.id, "2029-06-11", "2029-06-12");
    expect(
      (await checkAvailability(listing.id, ymdToDbDate(SAT_1), ymdToDbDate(SAT_2)))
        .available,
    ).toBe(false);
  });

  it("still answers a flexible listing exactly as before", async () => {
    const { listing } = await seed({ bookingMode: "FLEXIBLE" });
    expect(
      (
        await checkAvailability(
          listing.id,
          ymdToDbDate("2029-06-12"),
          ymdToDbDate("2029-06-15"),
        )
      ).available,
    ).toBe(true);
  });
});

describe("legacy bookings", () => {
  it("remain readable with their period pointer and snapshot intact", async () => {
    const { listing, guest } = await seed();
    // A booking sold under the old period model, written the way it was written then.
    const period = await db.listingFixedStayPeriod.create({
      data: {
        listingId: listing.id,
        checkIn: ymdToDbDate(SAT_4),
        checkOut: ymdToDbDate(SAT_5),
      },
      select: { id: true },
    });
    const legacy = await db.booking.create({
      data: {
        listingId: listing.id,
        guestId: guest.id,
        checkIn: ymdToDbDate(SAT_4),
        checkOut: ymdToDbDate(SAT_5),
        guestCount: 2,
        adults: 2,
        numberOfNights: 7,
        nightlyRate: 50,
        cleaningFee: 10,
        serviceFee: 0,
        totalPrice: 360,
        status: "CONFIRMED",
        fixedStayPeriodId: period.id,
        fixedStaySnapshot: {
          version: 1,
          periodId: period.id,
          checkIn: SAT_4,
          checkOut: SAT_5,
          nights: 7,
        },
      },
      select: { id: true },
    });

    const read = await db.booking.findUniqueOrThrow({
      where: { id: legacy.id },
      select: {
        fixedStayPeriodId: true,
        fixedStaySnapshot: true,
        fixedStayPeriod: { select: { id: true } },
      },
    });
    expect(read.fixedStayPeriodId).toBe(period.id);
    expect(read.fixedStayPeriod?.id).toBe(period.id);
    expect(read.fixedStaySnapshot).toMatchObject({ nights: 7, periodId: period.id });
  });
});

describe("the acceptance example", () => {
  it("offers exactly the four Saturdays and refuses the fifth", async () => {
    // Weekly, Saturday changeover, minimum 1, maximum 30, nothing blocked.
    const { listing, guests } = await seed({
      minNights: 1,
      maxNights: 30,
      extraGuests: 4,
    });
    const checkIn = "2026-10-03";
    expect(weekdayOfYmd(checkIn)).toBe(6);
    expect(todayYmd() < checkIn).toBe(true);

    // Each of the four allowed checkouts books on its own listing-clean run.
    for (const checkOut of [
      "2026-10-10",
      "2026-10-17",
      "2026-10-24",
      "2026-10-31",
    ]) {
      const own = await seed({ minNights: 1, maxNights: 30 });
      const booking = await book(own.listing.id, own.guest.id, checkIn, checkOut);
      expect(dbDateToYmd(booking.checkOut), checkOut).toBe(checkOut);
    }

    // 35 nights is over the maximum.
    await expect(
      book(listing.id, guests[0].id, checkIn, "2026-11-07"),
    ).rejects.toThrow(/longer than this host's maximum/);
    // A non-Saturday checkout is not a whole week.
    await expect(
      book(listing.id, guests[1].id, checkIn, "2026-10-12"),
    ).rejects.toThrow(/check-out must also be on a Saturday/);
  });
});

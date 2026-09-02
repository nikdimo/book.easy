import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  createBooking,
  FIXED_STAY_PAST_ERROR,
  FIXED_STAY_UNAVAILABLE_ERROR,
  FIXED_STAYS_LISTING_ERROR,
  FLEXIBLE_LISTING_ERROR,
} from "@/lib/services/booking.service";
import { setBookingModeForManagedListing } from "@/lib/services/fixed-stay-mutation.service";
import { dbDateToYmd, ymdToDbDate } from "@/lib/utils/date-only";
import { buildPriceOverrideMap, computeStayQuote } from "@/lib/utils/stay-pricing";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * Booking a fixed stay, against the real local Postgres (see vitest.config.ts).
 *
 * The whole point of this file is what a mock cannot show: that the stay's dates come out
 * of the database row rather than off the request, that the same advisory lock keeps a
 * host and a guest from disagreeing, and that the ordinary block rules still hold.
 */

/** Far enough out that the marketplace's real "today" can never reach it. */
const SAT_1 = "2029-06-09";
const SAT_2 = "2029-06-16";
const SAT_3 = "2029-06-23";
const SAT_4 = "2029-06-30";

const fixtures: TestFixtures[] = [];
const auditedUserIds: string[] = [];

afterEach(async () => {
  if (auditedUserIds.length > 0) {
    await db.auditLog.deleteMany({ where: { userId: { in: auditedUserIds } } });
    auditedUserIds.length = 0;
  }
  while (fixtures.length > 0) {
    await cleanupTestFixtures(fixtures.pop()!);
  }
});

async function seed(
  bookingMode: "FLEXIBLE" | "FIXED_STAYS" = "FIXED_STAYS",
  extraGuests = 0,
) {
  const { host, property, listing } = await createTestHostAndListing();
  const guests = await Promise.all(
    Array.from({ length: 1 + extraGuests }, () => createTestGuest()),
  );
  fixtures.push({
    hostId: host.id,
    propertyId: property.id,
    listingId: listing.id,
    extraUserIds: guests.map((guest) => guest.id),
  });
  auditedUserIds.push(host.id);

  await db.listing.update({ where: { id: listing.id }, data: { bookingMode } });
  return {
    host,
    listing,
    guest: guests[0],
    guests,
    managed: {
      id: listing.id,
      slug: listing.slug,
      status: listing.status,
      bookingMode,
    } as const,
  };
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

const bookingsFor = (listingId: string) =>
  db.booking.findMany({
    where: { listingId },
    select: {
      id: true,
      checkIn: true,
      checkOut: true,
      numberOfNights: true,
      totalPrice: true,
      nightlyRate: true,
      cleaningFee: true,
      priceBreakdown: true,
      fixedStayPeriodId: true,
      fixedStaySnapshot: true,
    },
  });

// ─── The happy path ─────────────────────────────────────────────────────────────

describe("booking a fixed stay", () => {
  it("books an enabled future period and takes its dates from the stored row", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      fixedStayPeriodId: period.id,
      guestCount: 2,
    });

    expect(dbDateToYmd(booking.checkIn)).toBe(SAT_1);
    expect(dbDateToYmd(booking.checkOut)).toBe(SAT_2);
    expect(booking.numberOfNights).toBe(7);
    expect(booking.status).toBe("PENDING");
  });

  it("books a 14-night period at its stored length", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_3);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      fixedStayPeriodId: period.id,
      guestCount: 2,
    });
    expect(booking.numberOfNights).toBe(14);
    expect(dbDateToYmd(booking.checkOut)).toBe(SAT_3);
  });

  it("stores the period pointer and a snapshot carrying no money", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      fixedStayPeriodId: period.id,
      guestCount: 2,
    });

    expect(booking.fixedStayPeriodId).toBe(period.id);
    expect(booking.fixedStaySnapshot).toEqual({
      version: 1,
      periodId: period.id,
      checkIn: SAT_1,
      checkOut: SAT_2,
      nights: 7,
    });
    const serialized = JSON.stringify(booking.fixedStaySnapshot).toLowerCase();
    for (const word of ["price", "rate", "fee", "amount", "currency", "total", "discount"]) {
      expect(serialized).not.toContain(word);
    }
  });

  it("creates the availability hold over the period's own nights", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      fixedStayPeriodId: period.id,
      guestCount: 2,
    });

    const hold = await db.availabilityBlock.findFirstOrThrow({
      where: { bookingId: booking.id, blockType: "BOOKING_HOLD" },
    });
    expect(dbDateToYmd(hold.startDate)).toBe(SAT_1);
    expect(dbDateToYmd(hold.endDate)).toBe(SAT_2);
  });

  it("keeps a flexible booking's fixed-stay columns null", async () => {
    const { listing, guest } = await seed("FLEXIBLE");
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: ymdToDbDate(SAT_1),
      checkOut: ymdToDbDate(SAT_2),
      guestCount: 2,
    });
    expect(booking.fixedStayPeriodId).toBeNull();
    expect(booking.fixedStaySnapshot).toBeNull();
  });
});

// ─── Refusals ───────────────────────────────────────────────────────────────────

describe("a fixed stay that cannot be booked", () => {
  it("refuses a period id that does not exist", async () => {
    const { listing, guest } = await seed();
    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        fixedStayPeriodId: "no-such-period",
        guestCount: 2,
      }),
    ).rejects.toThrow(FIXED_STAY_UNAVAILABLE_ERROR);
    expect(await bookingsFor(listing.id)).toEqual([]);
  });

  it("refuses a period belonging to another listing, with the same sentence", async () => {
    const mine = await seed();
    const theirs = await seed();
    const theirPeriod = await addPeriod(theirs.listing.id, SAT_1, SAT_2);

    await expect(
      createBooking({
        listingId: mine.listing.id,
        guestId: mine.guest.id,
        fixedStayPeriodId: theirPeriod.id,
        guestCount: 2,
      }),
    ).rejects.toThrow(FIXED_STAY_UNAVAILABLE_ERROR);
    // Nothing was created on either listing, and the message revealed no ownership.
    expect(await bookingsFor(mine.listing.id)).toEqual([]);
    expect(await bookingsFor(theirs.listing.id)).toEqual([]);
  });

  it("refuses a period the host switched off", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);
    await db.listingFixedStayPeriod.update({
      where: { id: period.id },
      data: { disabledAt: new Date() },
    });

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        fixedStayPeriodId: period.id,
        guestCount: 2,
      }),
    ).rejects.toThrow(FIXED_STAY_UNAVAILABLE_ERROR);
  });

  it("refuses a period whose check-in has already gone by", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, "2020-06-06", "2020-06-13");

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        fixedStayPeriodId: period.id,
        guestCount: 2,
      }),
    ).rejects.toThrow(FIXED_STAY_PAST_ERROR);
  });

  it("defensively refuses a stored period that is neither 7 nor 14 nights", async () => {
    const { listing, guest } = await seed();
    // Written straight to the table, past every write path this product has.
    const corrupt = await addPeriod(listing.id, SAT_1, "2029-06-19");

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        fixedStayPeriodId: corrupt.id,
        guestCount: 2,
      }),
    ).rejects.toThrow(FIXED_STAY_UNAVAILABLE_ERROR);
    expect(await bookingsFor(listing.id)).toEqual([]);
  });
});

describe("a request that disagrees with the listing's mode", () => {
  it("refuses dates sent to a listing that sells whole stays", async () => {
    const { listing, guest } = await seed();
    await addPeriod(listing.id, SAT_1, SAT_2);

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn: ymdToDbDate(SAT_1),
        checkOut: ymdToDbDate(SAT_2),
        guestCount: 2,
      }),
    ).rejects.toThrow(FIXED_STAYS_LISTING_ERROR);
    expect(await bookingsFor(listing.id)).toEqual([]);
  });

  it("refuses a period id sent to a listing that sells by date", async () => {
    const { listing, guest } = await seed("FLEXIBLE");
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        fixedStayPeriodId: period.id,
        guestCount: 2,
      }),
    ).rejects.toThrow(FLEXIBLE_LISTING_ERROR);
  });

  it("refuses a request that names neither, and one that names both", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        guestCount: 2,
      } as unknown as Parameters<typeof createBooking>[0]),
    ).rejects.toThrow("Choose your dates before sending your request.");

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        fixedStayPeriodId: period.id,
        checkIn: ymdToDbDate(SAT_1),
        checkOut: ymdToDbDate(SAT_2),
        guestCount: 2,
      } as unknown as Parameters<typeof createBooking>[0]),
    ).rejects.toThrow("Choose either your own dates or one of the host's stays, not both.");

    expect(await bookingsFor(listing.id)).toEqual([]);
  });
});

// ─── What fixed mode ignores, and what it does not ──────────────────────────────

describe("rules a fixed stay is not measured against", () => {
  it("ignores availability windows entirely", async () => {
    const { listing, guest } = await seed();
    // A closed calendar with no open window at all: a flexible request for these dates
    // would be refused outright.
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      fixedStayPeriodId: period.id,
      guestCount: 2,
    });
    expect(booking.numberOfNights).toBe(7);
  });

  it("ignores the listing's minimum and maximum stay", async () => {
    const { listing, guest } = await seed();
    // A 30-night minimum and a 3-night cap: a 7-night flexible stay fails both.
    await db.pricingRule.update({
      where: { listingId: listing.id },
      data: { minNights: 30, maxNights: 3 },
    });
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      fixedStayPeriodId: period.id,
      guestCount: 2,
    });
    expect(booking.numberOfNights).toBe(7);
  });

  it("still enforces capacity and the self-booking rule", async () => {
    const { listing, guest, host } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        fixedStayPeriodId: period.id,
        guestCount: 99,
      }),
    ).rejects.toThrow(/guests allowed|party size/i);
    await expect(
      createBooking({
        listingId: listing.id,
        guestId: host.id,
        fixedStayPeriodId: period.id,
        guestCount: 2,
      }),
    ).rejects.toThrow(/own listing/i);
  });
});

describe("flexible bookings are unchanged", () => {
  it("still applies availability windows on a closed calendar", async () => {
    const { listing, guest } = await seed("FLEXIBLE");
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn: ymdToDbDate(SAT_1),
        checkOut: ymdToDbDate(SAT_2),
        guestCount: 2,
      }),
    ).rejects.toThrow(/not open for booking/i);

    await db.listingAvailabilityWindow.create({
      data: {
        listingId: listing.id,
        startDate: ymdToDbDate(SAT_1),
        endDate: ymdToDbDate(SAT_4),
      },
    });
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: ymdToDbDate(SAT_1),
      checkOut: ymdToDbDate(SAT_2),
      guestCount: 2,
    });
    expect(booking.numberOfNights).toBe(7);
  });

  it("still bridges two touching windows, exactly as before", async () => {
    const { listing, guest } = await seed("FLEXIBLE");
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });
    await db.listingAvailabilityWindow.createMany({
      data: [
        {
          listingId: listing.id,
          startDate: ymdToDbDate(SAT_1),
          endDate: ymdToDbDate(SAT_2),
        },
        {
          listingId: listing.id,
          startDate: ymdToDbDate(SAT_2),
          endDate: ymdToDbDate(SAT_3),
        },
      ],
    });

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: ymdToDbDate("2029-06-12"),
      checkOut: ymdToDbDate("2029-06-20"),
      guestCount: 2,
    });
    expect(booking.numberOfNights).toBe(8);
  });

  it("still applies the minimum and maximum stay", async () => {
    const { listing, guest } = await seed("FLEXIBLE");
    await db.pricingRule.update({
      where: { listingId: listing.id },
      data: { minNights: 10, maxNights: 20 },
    });

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn: ymdToDbDate(SAT_1),
        checkOut: ymdToDbDate(SAT_2),
        guestCount: 2,
      }),
    ).rejects.toThrow(/Minimum stay is 10 nights/);

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn: ymdToDbDate(SAT_1),
        checkOut: ymdToDbDate("2029-07-14"),
        guestCount: 2,
      }),
    ).rejects.toThrow(/Maximum stay is 20 nights/);
  });
});

// ─── Pricing comes from the existing engine ─────────────────────────────────────

describe("what a fixed stay costs", () => {
  it("uses the listing's own nightly rate and cleaning fee", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      fixedStayPeriodId: period.id,
      guestCount: 2,
    });
    // The fixture's listing: 50 a night, 10 cleaning. Seven nights.
    expect(Number(booking.totalPrice)).toBe(7 * 50 + 10);
    expect(Number(booking.cleaningFee)).toBe(10);
    expect(Number(booking.nightlyRate)).toBe(50);
  });

  it("uses date-price overrides falling inside the period", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);
    await db.listingDatePrice.create({
      data: {
        listingId: listing.id,
        date: ymdToDbDate("2029-06-11"),
        nightlyRate: 150,
      },
    });
    // The checkout day is not a night, so an override there must not be charged.
    await db.listingDatePrice.create({
      data: {
        listingId: listing.id,
        date: ymdToDbDate(SAT_2),
        nightlyRate: 999,
      },
    });

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      fixedStayPeriodId: period.id,
      guestCount: 2,
    });
    expect(Number(booking.totalPrice)).toBe(6 * 50 + 150 + 10);
  });

  it("applies the listing's promotions on the same terms as a flexible stay", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);
    await db.listingPromotion.create({
      data: {
        listingId: listing.id,
        type: "PERCENT_DISCOUNT",
        discountPercent: 10,
        minimumNights: 7,
      },
    });

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      fixedStayPeriodId: period.id,
      guestCount: 2,
    });
    expect(Number(booking.discountAmount)).toBeGreaterThan(0);
    expect(booking.promotionType).toBe("PERCENT_DISCOUNT");
    expect(Number(booking.totalPrice)).toBeLessThan(7 * 50 + 10);
  });

  it("produces exactly what the shared quote engine produces for those dates", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);
    await db.listingDatePrice.create({
      data: {
        listingId: listing.id,
        date: ymdToDbDate("2029-06-12"),
        nightlyRate: 80,
      },
    });

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      fixedStayPeriodId: period.id,
      guestCount: 2,
    });

    const overrideRows = await db.listingDatePrice.findMany({
      where: { listingId: listing.id },
    });
    const expected = computeStayQuote({
      baseNightly: 50,
      cleaningFee: 10,
      checkIn: new Date(2029, 5, 9),
      checkOut: new Date(2029, 5, 16),
      overrides: buildPriceOverrideMap(overrideRows),
      promotions: [],
    });

    expect(Number(booking.totalPrice)).toBe(expected.total);
    const breakdown = booking.priceBreakdown as Record<string, unknown>;
    expect(breakdown.version).toBe(2);
    expect(breakdown.accommodationSubtotal).toBe(expected.accommodationSubtotal);
    expect(breakdown.finalTotal).toBe(expected.total);
    expect((breakdown.nights as unknown[]).length).toBe(7);
  });
});

// ─── Blocks and concurrency ─────────────────────────────────────────────────────

describe("negative blocks still decide", () => {
  it.each(["MANUAL_BLOCK", "EXTERNAL_SYNC"] as const)(
    "refuses a fixed stay overlapped by a %s block",
    async (blockType) => {
      const { listing, guest } = await seed();
      const period = await addPeriod(listing.id, SAT_1, SAT_2);
      await db.availabilityBlock.create({
        data: {
          listingId: listing.id,
          startDate: ymdToDbDate("2029-06-11"),
          endDate: ymdToDbDate("2029-06-13"),
          blockType,
        },
      });

      await expect(
        createBooking({
          listingId: listing.id,
          guestId: guest.id,
          fixedStayPeriodId: period.id,
          guestCount: 2,
        }),
      ).rejects.toThrow(/no longer available/i);
    },
  );

  it("refuses a fixed stay held by an existing booking hold", async () => {
    const { listing, guests } = await seed("FIXED_STAYS", 1);
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    await createBooking({
      listingId: listing.id,
      guestId: guests[0].id,
      fixedStayPeriodId: period.id,
      guestCount: 2,
    });
    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guests[1].id,
        fixedStayPeriodId: period.id,
        guestCount: 2,
      }),
    ).rejects.toThrow(/no longer available/i);
  });

  it("makes an overlapping fortnight unbookable once the week is taken", async () => {
    const { listing, guests } = await seed("FIXED_STAYS", 1);
    const week = await addPeriod(listing.id, SAT_1, SAT_2);
    const fortnight = await addPeriod(listing.id, SAT_1, SAT_3);

    await createBooking({
      listingId: listing.id,
      guestId: guests[0].id,
      fixedStayPeriodId: week.id,
      guestCount: 2,
    });
    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guests[1].id,
        fixedStayPeriodId: fortnight.id,
        guestCount: 2,
      }),
    ).rejects.toThrow(/no longer available/i);
  });

  it("makes both weekly options unbookable once the fortnight is taken", async () => {
    const { listing, guests } = await seed("FIXED_STAYS", 2);
    const fortnight = await addPeriod(listing.id, SAT_1, SAT_3);
    const firstWeek = await addPeriod(listing.id, SAT_1, SAT_2);
    const secondWeek = await addPeriod(listing.id, SAT_2, SAT_3);

    await createBooking({
      listingId: listing.id,
      guestId: guests[0].id,
      fixedStayPeriodId: fortnight.id,
      guestCount: 2,
    });
    for (const [index, week] of [firstWeek, secondWeek].entries()) {
      await expect(
        createBooking({
          listingId: listing.id,
          guestId: guests[index + 1].id,
          fixedStayPeriodId: week.id,
          guestCount: 2,
        }),
      ).rejects.toThrow(/no longer available/i);
    }
  });

  it("lets back-to-back periods both be booked — a checkout is not a night", async () => {
    const { listing, guests } = await seed("FIXED_STAYS", 1);
    const first = await addPeriod(listing.id, SAT_1, SAT_2);
    const second = await addPeriod(listing.id, SAT_2, SAT_3);

    const one = await createBooking({
      listingId: listing.id,
      guestId: guests[0].id,
      fixedStayPeriodId: first.id,
      guestCount: 2,
    });
    const two = await createBooking({
      listingId: listing.id,
      guestId: guests[1].id,
      fixedStayPeriodId: second.id,
      guestCount: 2,
    });
    expect(one.id).not.toBe(two.id);
    expect(await bookingsFor(listing.id)).toHaveLength(2);
  });
});

describe("two writers at once", () => {
  it("lets only one of two guests take the same fixed period", async () => {
    const { listing, guests } = await seed("FIXED_STAYS", 1);
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    const results = await Promise.allSettled([
      createBooking({
        listingId: listing.id,
        guestId: guests[0].id,
        fixedStayPeriodId: period.id,
        guestCount: 2,
      }),
      createBooking({
        listingId: listing.id,
        guestId: guests[1].id,
        fixedStayPeriodId: period.id,
        guestCount: 2,
      }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await bookingsFor(listing.id)).toHaveLength(1);
  });

  it("lets only one of two overlapping alternatives be taken", async () => {
    const { listing, guests } = await seed("FIXED_STAYS", 1);
    const week = await addPeriod(listing.id, SAT_1, SAT_2);
    const fortnight = await addPeriod(listing.id, SAT_1, SAT_3);

    const results = await Promise.allSettled([
      createBooking({
        listingId: listing.id,
        guestId: guests[0].id,
        fixedStayPeriodId: week.id,
        guestCount: 2,
      }),
      createBooking({
        listingId: listing.id,
        guestId: guests[1].id,
        fixedStayPeriodId: fortnight.id,
        guestCount: 2,
      }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await bookingsFor(listing.id)).toHaveLength(1);
  });

  it("serializes a host switching a period off against a guest booking it", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    const [booking] = await Promise.allSettled([
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        fixedStayPeriodId: period.id,
        guestCount: 2,
      }),
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listing.id}))`;
        await tx.listingFixedStayPeriod.update({
          where: { id: period.id },
          data: { disabledAt: new Date() },
        });
      }),
    ]);

    // One consistent winner: either the booking exists and points at the period, or it
    // does not exist at all. Never a half-written one.
    const bookings = await bookingsFor(listing.id);
    if (booking.status === "fulfilled") {
      expect(bookings).toHaveLength(1);
      expect(bookings[0].fixedStayPeriodId).toBe(period.id);
    } else {
      expect(bookings).toHaveLength(0);
    }
  });

  it("serializes a host switching booking mode against a guest booking", async () => {
    const { listing, guest, host, managed } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);

    const [booking] = await Promise.allSettled([
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        fixedStayPeriodId: period.id,
        guestCount: 2,
      }),
      setBookingModeForManagedListing(managed, host.id, "FLEXIBLE"),
    ]);

    const bookings = await bookingsFor(listing.id);
    if (booking.status === "fulfilled") {
      expect(bookings).toHaveLength(1);
      expect(bookings[0].fixedStayPeriodId).toBe(period.id);
    } else {
      expect(String(booking.reason)).toContain("booked by date");
      expect(bookings).toHaveLength(0);
    }
  });
});

describe("a refused request leaves nothing behind", () => {
  it("writes no booking, hold, timeline entry or queued email", async () => {
    const { listing, guest } = await seed();
    const period = await addPeriod(listing.id, SAT_1, SAT_2);
    await db.availabilityBlock.create({
      data: {
        listingId: listing.id,
        startDate: ymdToDbDate("2029-06-11"),
        endDate: ymdToDbDate("2029-06-13"),
        blockType: "MANUAL_BLOCK",
      },
    });

    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        fixedStayPeriodId: period.id,
        guestCount: 2,
      }),
    ).rejects.toThrow();

    expect(await db.booking.count({ where: { listingId: listing.id } })).toBe(0);
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
    expect(
      await db.bookingEmailDelivery.count({
        where: { booking: { listingId: listing.id } },
      }),
    ).toBe(0);
    // The period itself is untouched by a refused booking.
    const untouched = await db.listingFixedStayPeriod.findUniqueOrThrow({
      where: { id: period.id },
    });
    expect(untouched.disabledAt).toBeNull();
    expect(dbDateToYmd(untouched.checkIn)).toBe(SAT_1);
  });
});

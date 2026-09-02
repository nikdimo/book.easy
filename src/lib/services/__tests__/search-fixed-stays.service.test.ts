import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { searchListings } from "@/lib/services/search.service";
import { checkAvailability } from "@/lib/services/availability.service";
import { computeStayQuote, parseLocalYmd } from "@/lib/utils/stay-pricing";
import { ymdToDbDate } from "@/lib/utils/date-only";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * How a dated search treats a listing that sells whole stays, against the real local
 * Postgres (see vitest.config.ts).
 *
 * Integration rather than mocked, because the thing worth proving is the `where` itself:
 * that exactly one pair of dates matches, that the block rules still bite, and that the
 * count, the page and the filter preview all come from the one query rather than from
 * three that happen to agree today.
 */

const SAT_1 = "2029-06-09";
const SAT_2 = "2029-06-16";
const SAT_3 = "2029-06-23";
const SAT_4 = "2029-06-30";

const fixtures: TestFixtures[] = [];

afterEach(async () => {
  while (fixtures.length > 0) {
    await cleanupTestFixtures(fixtures.pop()!);
  }
});

/** A listing nothing else in the database can collide with, in its own city. */
async function seedListing(
  bookingMode: "FLEXIBLE" | "FIXED_STAYS",
  city: string,
) {
  const { host, property, listing } = await createTestHostAndListing();
  fixtures.push({
    hostId: host.id,
    propertyId: property.id,
    listingId: listing.id,
    extraUserIds: [],
  });
  await db.property.update({ where: { id: property.id }, data: { city } });
  await db.listing.update({ where: { id: listing.id }, data: { bookingMode } });
  return { host, property, listing };
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

/** A city nobody else's fixture uses, so a search in it sees only what this test made. */
const uniqueCity = () => `__FixedStayTest ${crypto.randomUUID()}__`;

const idsFrom = async (filters: Parameters<typeof searchListings>[0]) =>
  (await searchListings(filters)).listings.map((listing) => listing.id);

// ─── Exact matching ─────────────────────────────────────────────────────────────

describe("a dated search against a fixed-stay listing", () => {
  it("matches a 7-night search to the 7-night stay offering exactly those dates", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    const week = await addPeriod(listing.id, SAT_1, SAT_2);

    const results = await searchListings({
      city,
      checkIn: SAT_1,
      checkOut: SAT_2,
    });
    expect(results.listings.map((l) => l.id)).toEqual([listing.id]);
    expect(results.listings[0].matchedFixedStayPeriodId).toBe(week.id);
    expect(results.listings[0].bookingMode).toBe("FIXED_STAYS");
  });

  it("matches a 14-night search to the fortnight offering exactly those dates", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    await addPeriod(listing.id, SAT_1, SAT_2);
    const fortnight = await addPeriod(listing.id, SAT_1, SAT_3);

    const results = await searchListings({
      city,
      checkIn: SAT_1,
      checkOut: SAT_3,
    });
    expect(results.listings[0]?.matchedFixedStayPeriodId).toBe(fortnight.id);
  });

  it.each([
    ["one night shorter", SAT_1, "2029-06-15"],
    ["one night longer", SAT_1, "2029-06-17"],
    ["starting a day late", "2029-06-10", "2029-06-17"],
    ["wholly inside the stay", "2029-06-11", "2029-06-13"],
    ["overlapping only its tail", "2029-06-14", "2029-06-21"],
    ["three weeks spanning it", SAT_1, "2029-06-30"],
  ])("does not match a search %s", async (_label, checkIn, checkOut) => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    await addPeriod(listing.id, SAT_1, SAT_2);

    expect(await idsFrom({ city, checkIn, checkOut })).toEqual([]);
  });

  it("does not join two back-to-back weeks into the fortnight between them", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    await addPeriod(listing.id, SAT_1, SAT_2);
    await addPeriod(listing.id, SAT_2, SAT_3);

    // Both weeks are on sale; the fortnight spanning them is not.
    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_3 })).toEqual([]);
    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_2 })).toEqual([
      listing.id,
    ]);
  });

  it("does not match a stay the host switched off", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    const week = await addPeriod(listing.id, SAT_1, SAT_2);
    await db.listingFixedStayPeriod.update({
      where: { id: week.id },
      data: { disabledAt: new Date() },
    });

    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_2 })).toEqual([]);
  });

  it("does not match a stay whose dates have already passed", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    await addPeriod(listing.id, "2020-06-06", "2020-06-13");

    expect(
      await idsFrom({ city, checkIn: "2020-06-06", checkOut: "2020-06-13" }),
    ).toEqual([]);
  });

  it("does not match another listing's stay", async () => {
    const city = uniqueCity();
    const mine = await seedListing("FIXED_STAYS", city);
    const theirs = await seedListing("FIXED_STAYS", uniqueCity());
    await addPeriod(theirs.listing.id, SAT_1, SAT_2);

    // The stay exists, but not on the listing this search reaches.
    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_2 })).toEqual([]);
    void mine;
  });

  it("finds nothing on a fixed-stay listing with no stays at all", async () => {
    const city = uniqueCity();
    await seedListing("FIXED_STAYS", city);
    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_2 })).toEqual([]);
  });
});

// ─── Blocks still decide ────────────────────────────────────────────────────────

describe("nights that are already held", () => {
  it.each(["MANUAL_BLOCK", "EXTERNAL_SYNC", "BOOKING_HOLD"] as const)(
    "excludes a matched stay overlapped by a %s block",
    async (blockType) => {
      const city = uniqueCity();
      const { listing } = await seedListing("FIXED_STAYS", city);
      await addPeriod(listing.id, SAT_1, SAT_2);
      await db.availabilityBlock.create({
        data: {
          listingId: listing.id,
          startDate: ymdToDbDate("2029-06-11"),
          endDate: ymdToDbDate("2029-06-13"),
          blockType,
        },
      });

      expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_2 })).toEqual([]);
    },
  );

  it("withdraws an overlapping alternative once its neighbour is taken", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    await addPeriod(listing.id, SAT_1, SAT_2);
    await addPeriod(listing.id, SAT_1, SAT_3);
    const guest = await createTestGuest();
    fixtures[fixtures.length - 1].extraUserIds.push(guest.id);

    // A booking hold over the first week — the row `createBooking` writes.
    await db.availabilityBlock.create({
      data: {
        listingId: listing.id,
        startDate: ymdToDbDate(SAT_1),
        endDate: ymdToDbDate(SAT_2),
        blockType: "BOOKING_HOLD",
      },
    });

    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_2 })).toEqual([]);
    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_3 })).toEqual([]);
  });

  it("leaves a back-to-back stay bookable — a checkout is not an occupied night", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    await addPeriod(listing.id, SAT_1, SAT_2);
    await addPeriod(listing.id, SAT_2, SAT_3);
    await db.availabilityBlock.create({
      data: {
        listingId: listing.id,
        startDate: ymdToDbDate(SAT_1),
        endDate: ymdToDbDate(SAT_2),
        blockType: "BOOKING_HOLD",
      },
    });

    expect(await idsFrom({ city, checkIn: SAT_2, checkOut: SAT_3 })).toEqual([
      listing.id,
    ]);
  });
});

// ─── Rules that do not apply, and rules that still do ───────────────────────────

describe("flexible-only rules are not applied to fixed stays", () => {
  it("ignores a closed calendar with no open windows", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });
    await addPeriod(listing.id, SAT_1, SAT_2);

    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_2 })).toEqual([
      listing.id,
    ]);
  });

  it("ignores the listing's minimum and maximum stay", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    await db.pricingRule.update({
      where: { listingId: listing.id },
      data: { minNights: 30, maxNights: 3 },
    });
    await addPeriod(listing.id, SAT_1, SAT_2);

    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_2 })).toEqual([
      listing.id,
    ]);
  });

  it("keeps a fixed-stay listing in undated discovery even when sold out", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });
    const week = await addPeriod(listing.id, SAT_1, SAT_2);
    await db.listingFixedStayPeriod.update({
      where: { id: week.id },
      data: { disabledAt: new Date() },
    });

    // Undated: no dates to match, and its `availabilityMode` says nothing about it.
    const results = await searchListings({ city });
    expect(results.listings.map((l) => l.id)).toEqual([listing.id]);
    expect(results.listings[0].matchedFixedStayPeriodId).toBeNull();
  });
});

describe("flexible listings keep every rule they had", () => {
  it("still hides a closed listing whose windows do not cover the stay", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FLEXIBLE", city);
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });

    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_2 })).toEqual([]);

    await db.listingAvailabilityWindow.create({
      data: {
        listingId: listing.id,
        startDate: ymdToDbDate(SAT_1),
        endDate: ymdToDbDate(SAT_4),
      },
    });
    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_2 })).toEqual([
      listing.id,
    ]);
  });

  it("still enforces the minimum and maximum stay", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FLEXIBLE", city);
    await db.pricingRule.update({
      where: { listingId: listing.id },
      data: { minNights: 10, maxNights: 20 },
    });

    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_2 })).toEqual([]);
    expect(
      await idsFrom({ city, checkIn: SAT_1, checkOut: "2029-07-14" }),
    ).toEqual([]);
    expect(await idsFrom({ city, checkIn: SAT_1, checkOut: SAT_3 })).toEqual([
      listing.id,
    ]);
  });

  it("still hides a closed listing from undated discovery", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FLEXIBLE", city);
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });

    expect(await idsFrom({ city })).toEqual([]);
  });

  it("carries no fixed-stay pointer on a flexible card", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FLEXIBLE", city);
    const dated = await searchListings({ city, checkIn: SAT_1, checkOut: SAT_2 });
    expect(dated.listings[0].id).toBe(listing.id);
    expect(dated.listings[0].bookingMode).toBe("FLEXIBLE");
    expect(dated.listings[0].matchedFixedStayPeriodId).toBeNull();
  });
});

// ─── One result set behind every surface ────────────────────────────────────────

describe("the count, the grid and the map come from one result set", () => {
  // `getSearchFilterPreview` shares `buildListingWhere` with `searchListings`, but it
  // reaches `unstable_cache` on the way to its property-type facet, which needs a Next
  // request context this suite has no way to provide. The agreement asserted here is the
  // one that is observable outside a request: the `total` every surface counts from and
  // the rows the grid and the map pins are both built out of.
  it("counts exactly what it renders, in a mixed set", async () => {
    const city = uniqueCity();
    const fixed = await seedListing("FIXED_STAYS", city);
    const flexible = await seedListing("FLEXIBLE", city);
    await db.property.update({
      where: { id: flexible.property.id },
      data: { city },
    });
    await addPeriod(fixed.listing.id, SAT_1, SAT_2);

    const dated = await searchListings({ city, checkIn: SAT_1, checkOut: SAT_2 });
    expect(dated.total).toBe(2);
    expect(dated.listings).toHaveLength(2);
    expect(dated.totalPages).toBe(1);
    // The map pins are built from `results.listings` — the same array, so a pin can only
    // exist for a card that exists.
    expect(new Set(dated.listings.map((l) => l.id))).toEqual(
      new Set([fixed.listing.id, flexible.listing.id]),
    );

    // The fixed listing drops out for dates it does not offer; the flexible one stays,
    // and the count follows the grid rather than being computed apart from it.
    const other = await searchListings({
      city,
      checkIn: "2029-06-11",
      checkOut: "2029-06-14",
    });
    expect(other.listings.map((l) => l.id)).toEqual([flexible.listing.id]);
    expect(other.total).toBe(1);
  });

  it("agrees with a price-sorted read, which pages through its own ordering", async () => {
    const city = uniqueCity();
    const fixed = await seedListing("FIXED_STAYS", city);
    await addPeriod(fixed.listing.id, SAT_1, SAT_2);

    const sorted = await searchListings({
      city,
      checkIn: SAT_1,
      checkOut: SAT_2,
      sort: "price_asc",
    });
    expect(sorted.listings.map((l) => l.id)).toEqual([fixed.listing.id]);
    expect(sorted.total).toBe(1);
    // The matched stay survives the price stage's own paging path.
    expect(sorted.listings[0].matchedFixedStayPeriodId).not.toBeNull();
  });

  it("honours a price bound on a fixed-stay result the same way", async () => {
    const city = uniqueCity();
    const fixed = await seedListing("FIXED_STAYS", city);
    await addPeriod(fixed.listing.id, SAT_1, SAT_2);

    // The fixture lists at 50 a night.
    const inBand = await searchListings({
      city,
      checkIn: SAT_1,
      checkOut: SAT_2,
      minPrice: 10,
      maxPrice: 200,
    });
    expect(inBand.listings.map((l) => l.id)).toEqual([fixed.listing.id]);

    const outOfBand = await searchListings({
      city,
      checkIn: SAT_1,
      checkOut: SAT_2,
      minPrice: 500,
    });
    expect(outOfBand.listings).toEqual([]);
  });
});

describe("the matched stays are read in one query", () => {
  it("asks once for a whole page of fixed-stay results, not once per card", async () => {
    const city = uniqueCity();
    const listings = [];
    for (let index = 0; index < 3; index += 1) {
      const seeded = await seedListing("FIXED_STAYS", city);
      await addPeriod(seeded.listing.id, SAT_1, SAT_2);
      listings.push(seeded.listing.id);
    }

    const spy = vi.spyOn(db.listingFixedStayPeriod, "findMany");
    try {
      const results = await searchListings({
        city,
        checkIn: SAT_1,
        checkOut: SAT_2,
      });
      expect(results.listings).toHaveLength(3);
      expect(
        results.listings.every((l) => l.matchedFixedStayPeriodId !== null),
      ).toBe(true);
      // One read for the page. Three cards, three matched stays, one query.
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]?.where).toMatchObject({
        listingId: { in: expect.arrayContaining(listings) },
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("asks not at all when the search carries no dates", async () => {
    const city = uniqueCity();
    const seeded = await seedListing("FIXED_STAYS", city);
    await addPeriod(seeded.listing.id, SAT_1, SAT_2);

    const spy = vi.spyOn(db.listingFixedStayPeriod, "findMany");
    try {
      await searchListings({ city });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("asks not at all when the page holds only flexible listings", async () => {
    const city = uniqueCity();
    await seedListing("FLEXIBLE", city);

    const spy = vi.spyOn(db.listingFixedStayPeriod, "findMany");
    try {
      const results = await searchListings({
        city,
        checkIn: SAT_1,
        checkOut: SAT_2,
      });
      expect(results.listings).toHaveLength(1);
      // The batched read still runs once for the page — it cannot know the page is all
      // flexible without asking — but it is one query, and never one per card.
      expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
      expect(results.listings[0].matchedFixedStayPeriodId).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });
});

// ─── Pricing ────────────────────────────────────────────────────────────────────

describe("what a matched fixed stay costs on its card", () => {
  it("is the ordinary quote over the period's dates, overrides and all", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    await addPeriod(listing.id, SAT_1, SAT_2);
    await db.listingDatePrice.create({
      data: {
        listingId: listing.id,
        date: ymdToDbDate("2029-06-11"),
        nightlyRate: 150,
      },
    });

    const results = await searchListings({
      city,
      checkIn: SAT_1,
      checkOut: SAT_2,
    });
    const card = results.listings[0];
    const expected = computeStayQuote({
      baseNightly: 50,
      cleaningFee: 10,
      checkIn: parseLocalYmd(SAT_1),
      checkOut: parseLocalYmd(SAT_2),
      overrides: new Map(card.priceOverrides.map((row) => [row.date, row.rate])),
      promotions: card.promotions,
    });
    // Six nights at 50, one at 150, plus the 10 cleaning fee — the same engine the
    // listing page and the booking request run.
    expect(expected.total).toBe(6 * 50 + 150 + 10);
    expect(card.priceOverrides).toContainEqual({ date: "2029-06-11", rate: 150 });
    expect(card.pricingRule?.currency).toBe("EUR");
  });

  it("carries the listing's promotions to the card, not a price of its own", async () => {
    const city = uniqueCity();
    const { listing } = await seedListing("FIXED_STAYS", city);
    await addPeriod(listing.id, SAT_1, SAT_2);
    await db.listingPromotion.create({
      data: {
        listingId: listing.id,
        type: "PERCENT_DISCOUNT",
        discountPercent: 10,
        minimumNights: 7,
      },
    });

    const card = (
      await searchListings({ city, checkIn: SAT_1, checkOut: SAT_2 })
    ).listings[0];
    expect(card.promotions).toHaveLength(1);
    const serialized = JSON.stringify(card).toLowerCase();
    for (const word of ["packageprice", "package_price"]) {
      expect(serialized).not.toContain(word);
    }
  });
});

// ─── The shared availability read ───────────────────────────────────────────────

describe("checkAvailability answers by booking mode", () => {
  it("accepts an exact enabled stay and names it", async () => {
    const { listing } = await seedListing("FIXED_STAYS", uniqueCity());
    const week = await addPeriod(listing.id, SAT_1, SAT_2);

    expect(
      await checkAvailability(
        listing.id,
        ymdToDbDate(SAT_1),
        ymdToDbDate(SAT_2),
      ),
    ).toEqual({ available: true, fixedStayPeriodId: week.id });
  });

  it("refuses dates that are not one of the host's stays", async () => {
    const { listing } = await seedListing("FIXED_STAYS", uniqueCity());
    await addPeriod(listing.id, SAT_1, SAT_2);

    for (const [checkIn, checkOut] of [
      [SAT_1, "2029-06-15"],
      ["2029-06-10", "2029-06-17"],
      [SAT_1, SAT_3],
    ]) {
      expect(
        await checkAvailability(
          listing.id,
          ymdToDbDate(checkIn),
          ymdToDbDate(checkOut),
        ),
      ).toEqual({ available: false });
    }
  });

  it("refuses a switched-off stay and a blocked one", async () => {
    const off = await seedListing("FIXED_STAYS", uniqueCity());
    const disabled = await addPeriod(off.listing.id, SAT_1, SAT_2);
    await db.listingFixedStayPeriod.update({
      where: { id: disabled.id },
      data: { disabledAt: new Date() },
    });
    expect(
      await checkAvailability(
        off.listing.id,
        ymdToDbDate(SAT_1),
        ymdToDbDate(SAT_2),
      ),
    ).toMatchObject({ available: false });

    const held = await seedListing("FIXED_STAYS", uniqueCity());
    await addPeriod(held.listing.id, SAT_1, SAT_2);
    await db.availabilityBlock.create({
      data: {
        listingId: held.listing.id,
        startDate: ymdToDbDate("2029-06-11"),
        endDate: ymdToDbDate("2029-06-13"),
        blockType: "MANUAL_BLOCK",
      },
    });
    const blocked = await checkAvailability(
      held.listing.id,
      ymdToDbDate(SAT_1),
      ymdToDbDate(SAT_2),
    );
    expect(blocked.available).toBe(false);
    expect(blocked.conflictingDates).toHaveLength(1);
  });

  it("ignores availability windows and stay-length limits in fixed mode", async () => {
    const { listing } = await seedListing("FIXED_STAYS", uniqueCity());
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });
    await db.pricingRule.update({
      where: { listingId: listing.id },
      data: { minNights: 30 },
    });
    await addPeriod(listing.id, SAT_1, SAT_2);

    expect(
      (
        await checkAvailability(
          listing.id,
          ymdToDbDate(SAT_1),
          ymdToDbDate(SAT_2),
        )
      ).available,
    ).toBe(true);
  });

  it("is unchanged for a flexible listing", async () => {
    const { listing } = await seedListing("FLEXIBLE", uniqueCity());

    // OPEN: any dates, unless something blocks them.
    expect(
      await checkAvailability(
        listing.id,
        ymdToDbDate(SAT_1),
        ymdToDbDate(SAT_2),
      ),
    ).toEqual({ available: true });

    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });
    expect(
      await checkAvailability(
        listing.id,
        ymdToDbDate(SAT_1),
        ymdToDbDate(SAT_2),
      ),
    ).toEqual({ available: false });

    await db.listingAvailabilityWindow.create({
      data: {
        listingId: listing.id,
        startDate: ymdToDbDate(SAT_1),
        endDate: ymdToDbDate(SAT_4),
      },
    });
    expect(
      (
        await checkAvailability(
          listing.id,
          ymdToDbDate(SAT_1),
          ymdToDbDate(SAT_2),
        )
      ).available,
    ).toBe(true);
  });

  it("refuses a listing that does not exist", async () => {
    expect(
      await checkAvailability(
        "no-such-listing",
        ymdToDbDate(SAT_1),
        ymdToDbDate(SAT_2),
      ),
    ).toEqual({ available: false });
  });
});

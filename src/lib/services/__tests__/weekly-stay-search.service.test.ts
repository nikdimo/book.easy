import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { searchListings } from "@/lib/services/search.service";
import { ymdToDbDate } from "@/lib/utils/date-only";
import {
  cleanupTestFixtures,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * Which dated searches a weekly listing answers, against the real local Postgres.
 *
 * The rule is the same one the booking transaction applies, expressed in SQL: the
 * requested range already fixes the weekday and the night count for every listing at
 * once, so a weekly listing matches exactly when its changeover day *is* that weekday
 * and its own stay limits admit that many nights.
 */

const SAT_1 = "2029-06-09";
const SAT_2 = "2029-06-16";
const SAT_3 = "2029-06-23";

const fixtures: TestFixtures[] = [];

afterEach(async () => {
  while (fixtures.length > 0) await cleanupTestFixtures(fixtures.pop()!);
});

async function seed(options: {
  bookingMode?: "FLEXIBLE" | "FIXED_STAYS";
  changeoverWeekday?: string | null;
  minNights?: number;
  maxNights?: number;
} = {}) {
  const { host, property, listing } = await createTestHostAndListing();
  fixtures.push({
    hostId: host.id,
    propertyId: property.id,
    listingId: listing.id,
    extraUserIds: [],
  });
  await db.listing.update({
    where: { id: listing.id },
    data: {
      bookingMode: options.bookingMode ?? "FIXED_STAYS",
      changeoverWeekday:
        options.changeoverWeekday === undefined
          ? "SATURDAY"
          : (options.changeoverWeekday as never),
      // Give it a distinctive title so the search can be narrowed to this fixture.
      title: listing.title,
    },
  });
  await db.pricingRule.update({
    where: { listingId: listing.id },
    data: { minNights: options.minNights ?? 1, maxNights: options.maxNights ?? 30 },
  });
  return listing;
}

/** Whether a dated search returns this particular listing. */
async function matches(
  listingId: string,
  checkIn: string,
  checkOut: string,
): Promise<boolean> {
  const results = await searchListings({ checkIn, checkOut, page: 1 });
  return results.listings.some((row) => row.id === listingId);
}

describe("a weekly listing in dated search", () => {
  it("matches a whole week on its changeover day", async () => {
    const listing = await seed();
    expect(await matches(listing.id, SAT_1, SAT_2)).toBe(true);
  });

  it("matches two and three whole weeks inside the maximum", async () => {
    const listing = await seed();
    expect(await matches(listing.id, SAT_1, SAT_3)).toBe(true);
    expect(await matches(listing.id, SAT_1, "2029-06-30")).toBe(true);
  });

  it("does not match a range starting on another weekday", async () => {
    const listing = await seed();
    expect(await matches(listing.id, "2029-06-10", "2029-06-17")).toBe(false);
  });

  it("does not match a range that is not whole weeks", async () => {
    const listing = await seed();
    // Right arrival day, six nights.
    expect(await matches(listing.id, SAT_1, "2029-06-15")).toBe(false);
    // Right arrival day, eight nights.
    expect(await matches(listing.id, SAT_1, "2029-06-17")).toBe(false);
  });

  it("does not match a listing whose changeover day is a different one", async () => {
    const listing = await seed({ changeoverWeekday: "MONDAY" });
    expect(await matches(listing.id, SAT_1, SAT_2)).toBe(false);
    // ...and does match its own day.
    expect(await matches(listing.id, "2029-06-11", "2029-06-18")).toBe(true);
  });

  it("fails closed when the host has not chosen a changeover day", async () => {
    const listing = await seed({ changeoverWeekday: null });
    expect(await matches(listing.id, SAT_1, SAT_2)).toBe(false);
  });

  it("applies the listing's own minimum stay", async () => {
    const listing = await seed({ minNights: 10 });
    expect(await matches(listing.id, SAT_1, SAT_2)).toBe(false);
    expect(await matches(listing.id, SAT_1, SAT_3)).toBe(true);
  });

  it("applies the listing's own maximum stay", async () => {
    const listing = await seed({ maxNights: 13 });
    expect(await matches(listing.id, SAT_1, SAT_2)).toBe(true);
    expect(await matches(listing.id, SAT_1, SAT_3)).toBe(false);
  });

  it("does not match when a night inside the range is blocked", async () => {
    const listing = await seed();
    await db.availabilityBlock.create({
      data: {
        listingId: listing.id,
        startDate: ymdToDbDate("2029-06-11"),
        endDate: ymdToDbDate("2029-06-12"),
        blockType: "MANUAL_BLOCK",
      },
    });
    expect(await matches(listing.id, SAT_1, SAT_2)).toBe(false);
  });

  it("still matches when the block ends on the check-in day", async () => {
    const listing = await seed();
    await db.availabilityBlock.create({
      data: {
        listingId: listing.id,
        startDate: ymdToDbDate("2029-06-02"),
        endDate: ymdToDbDate(SAT_1),
        blockType: "MANUAL_BLOCK",
      },
    });
    expect(await matches(listing.id, SAT_1, SAT_2)).toBe(true);
  });

  it("does not match outside its availability windows", async () => {
    const listing = await seed();
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });
    expect(await matches(listing.id, SAT_1, SAT_2)).toBe(false);
  });

  it("matches inside adjacent availability windows", async () => {
    const listing = await seed();
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });
    await db.listingAvailabilityWindow.createMany({
      data: [
        {
          listingId: listing.id,
          startDate: ymdToDbDate("2029-06-01"),
          endDate: ymdToDbDate("2029-06-12"),
        },
        {
          listingId: listing.id,
          startDate: ymdToDbDate("2029-06-12"),
          endDate: ymdToDbDate("2029-06-20"),
        },
      ],
    });
    expect(await matches(listing.id, SAT_1, SAT_2)).toBe(true);
  });

  it("stays out of undated discovery with a closed calendar", async () => {
    const listing = await seed();
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });
    const results = await searchListings({ page: 1 });
    expect(results.listings.some((row) => row.id === listing.id)).toBe(false);
  });
});

describe("flexible listings are unaffected", () => {
  it("still matches an arbitrary range on any weekday", async () => {
    const listing = await seed({ bookingMode: "FLEXIBLE" });
    expect(await matches(listing.id, "2029-06-12", "2029-06-15")).toBe(true);
  });

  it("still enforces its own minimum and maximum", async () => {
    const listing = await seed({
      bookingMode: "FLEXIBLE",
      minNights: 5,
      maxNights: 10,
    });
    expect(await matches(listing.id, "2029-06-12", "2029-06-15")).toBe(false);
    expect(await matches(listing.id, "2029-06-12", "2029-06-19")).toBe(true);
  });

  it("still refuses dates outside its windows", async () => {
    const listing = await seed({ bookingMode: "FLEXIBLE" });
    await db.listing.update({
      where: { id: listing.id },
      data: { availabilityMode: "CLOSED" },
    });
    expect(await matches(listing.id, SAT_1, SAT_2)).toBe(false);
  });
});

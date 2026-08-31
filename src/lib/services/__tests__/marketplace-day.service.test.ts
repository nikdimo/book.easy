import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

/**
 * M6: the booking flow gets one clock, and it is the marketplace's.
 *
 * The sharp end of the finding was `completePastBookings`. It compared a *server-local
 * midnight* — an instant — against `checkOut`, a `@db.Date` column Prisma reads back as
 * UTC midnight. On a UTC+2 host those are two hours apart in the wrong direction, so a
 * stay ending today never satisfied `lte` and the booking only reached COMPLETED the
 * day *after* checkout. Reviews open off that status, so the whole review window
 * shifted with it.
 *
 * L7 later moved the boundary again, from the start of that day to the checkout
 * *instant* on it — midnight is not checkout — so the sweeps below are run at the
 * checkout time rather than at the day start. What these still pin is M6's own claim:
 * which calendar day a stay ends on is the marketplace's, not the server's zone's.
 *
 * These run against the real local Postgres, like every other service test here, so
 * they also pin the thing no pure test can: that a `@db.Date` value written as one
 * calendar day comes back as that same day, from a process in any zone. Run
 * `npm run db:docker` first if the container isn't already up.
 */

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

import { db } from "@/lib/db";
import { completePastBookings } from "@/lib/services/booking.service";
import {
  addDaysToYmd,
  dbDateToYmd,
  marketplaceYmd,
  todayYmd,
  ymdToDbDate,
  zonedTimeToInstant,
} from "@/lib/utils/date-only";
import { DEFAULT_CHECKOUT_TIME } from "@/lib/services/review-window";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

const ORIGINAL_TZ = process.env.TZ;
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

async function inZone<T>(zone: string, body: () => Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await body();
  } finally {
    process.env.TZ = previous;
  }
}

/**
 * The first instant of a marketplace day, found rather than assumed.
 *
 * Europe/Skopje is UTC+1 or UTC+2 depending on the season, so the offset cannot be
 * hard-coded without the test quietly becoming a summer-only test. Walking back from
 * UTC midnight until the marketplace date flips finds the real boundary either way.
 */
function marketplaceDayStart(ymd: string): Date {
  let instant = ymdToDbDate(ymd);
  while (marketplaceYmd(new Date(instant.getTime() - 60_000)) === ymd) {
    instant = new Date(instant.getTime() - 60_000);
  }
  return instant;
}

const fixtures: TestFixtures[] = [];
afterEach(async () => {
  while (fixtures.length > 0) {
    await cleanupTestFixtures(fixtures.pop()!);
  }
});

/**
 * A confirmed stay ending on `checkOutYmd`.
 *
 * Written straight through Prisma rather than through `createBooking`, because what is
 * under test is the sweep's reading of the stored dates, not the request flow — and a
 * booking whose stay has already ended is not one `createBooking` would accept.
 */
async function confirmedStay(checkOutYmd: string) {
  const { host, property, listing } = await createTestHostAndListing();
  const guest = await createTestGuest();
  fixtures.push({
    hostId: host.id,
    propertyId: property.id,
    listingId: listing.id,
    extraUserIds: [guest.id],
  });

  const booking = await db.booking.create({
    data: {
      listingId: listing.id,
      guestId: guest.id,
      checkIn: ymdToDbDate(addDaysToYmd(checkOutYmd, -2)),
      checkOut: ymdToDbDate(checkOutYmd),
      guestCount: 1,
      adults: 1,
      numberOfNights: 2,
      nightlyRate: 50,
      cleaningFee: 10,
      serviceFee: 0,
      totalPrice: 110,
      status: "CONFIRMED",
    },
    select: { id: true, checkIn: true, checkOut: true },
  });
  return booking;
}

const statusOf = async (id: string) =>
  (await db.booking.findUniqueOrThrow({ where: { id }, select: { status: true } }))
    .status;

describe("a stay completes at its marketplace checkout instant", () => {
  // L7 moved the boundary from the *start* of the checkout day to the checkout time
  // itself. These stays carry no `houseRulesSnapshot`, which is the legacy population,
  // so the boundary they are held to is the documented 10:00 marketplace fallback.
  const checkoutInstant = (ymd: string) =>
    zonedTimeToInstant(ymd, DEFAULT_CHECKOUT_TIME);

  it("completes a stay that ends today, and leaves tomorrow's alone", async () => {
    // Anchored to the real marketplace today on purpose: the sweep's `where` is not
    // scoped to a listing, so a fabricated "now" would complete every other test's
    // confirmed booking too. A sweep at the real today is the production one.
    const today = todayYmd();
    const endsToday = await confirmedStay(today);
    const endsTomorrow = await confirmedStay(addDaysToYmd(today, 1));
    const endedYesterday = await confirmedStay(addDaysToYmd(today, -1));

    await completePastBookings(checkoutInstant(today));

    // The M6 finding: before that fix this stayed CONFIRMED until tomorrow.
    expect(await statusOf(endsToday.id)).toBe("COMPLETED");
    expect(await statusOf(endedYesterday.id)).toBe("COMPLETED");
    expect(await statusOf(endsTomorrow.id)).toBe("CONFIRMED");
  });

  it("leaves a stay alone at the marketplace's midnight, hours before checkout", async () => {
    const today = todayYmd();
    const dayStart = marketplaceDayStart(today);
    const endsToday = await confirmedStay(today);

    // The day has flipped — the M6 boundary — but the guest has not left yet, so the
    // review window this status opens must stay shut (L7).
    expect(marketplaceYmd(dayStart)).toBe(today);
    await completePastBookings(dayStart);
    expect(await statusOf(endsToday.id)).toBe("CONFIRMED");
  });

  it("flips at the checkout instant, not a minute before it", async () => {
    const today = todayYmd();
    const checkout = checkoutInstant(today);
    const endsToday = await confirmedStay(today);

    await completePastBookings(new Date(checkout.getTime() - 60_000));
    expect(await statusOf(endsToday.id)).toBe("CONFIRMED");

    // Exactly at checkout, not a moment after.
    await completePastBookings(checkout);
    expect(await statusOf(endsToday.id)).toBe("COMPLETED");
  });

  it("completes at the same instant from a server behind UTC", async () => {
    const today = todayYmd();
    const endsToday = await confirmedStay(today);

    await inZone("America/Chicago", async () => {
      await completePastBookings(checkoutInstant(today));
    });

    expect(await statusOf(endsToday.id)).toBe("COMPLETED");
  });

  it("completes at the same instant from a server far ahead of UTC", async () => {
    const today = todayYmd();
    const endsToday = await confirmedStay(today);
    const endsTomorrow = await confirmedStay(addDaysToYmd(today, 1));

    await inZone("Pacific/Kiritimati", async () => {
      await completePastBookings(checkoutInstant(today));
    });

    expect(await statusOf(endsToday.id)).toBe("COMPLETED");
    // A server 14 hours ahead must not reach into tomorrow's stays either.
    expect(await statusOf(endsTomorrow.id)).toBe("CONFIRMED");
  });

  it("stamps the completion at the checkout instant, never in the future", async () => {
    const today = todayYmd();
    const checkout = checkoutInstant(today);
    const endsToday = await confirmedStay(today);

    await completePastBookings(checkout);

    const event = await db.bookingTimelineEvent.findFirstOrThrow({
      where: { bookingId: endsToday.id, type: "COMPLETED" },
      select: { createdAt: true },
    });
    // The stay ended when it ended; the sweep only noticed. And the sweep never runs
    // before that moment, so the stamp cannot land ahead of the run that wrote it.
    expect(event.createdAt.getTime()).toBe(checkout.getTime());
  });
});

describe("stored calendar dates come back as the day they were written", () => {
  const dates = ["2028-02-29", "2028-03-01", "2026-12-31", "2027-01-01", "2026-10-25"];

  it("round-trips a `@db.Date` through Postgres in a zone behind UTC", async () => {
    await inZone("America/Chicago", async () => {
      for (const checkOutYmd of dates) {
        const booking = await confirmedStay(checkOutYmd);
        const stored = await db.booking.findUniqueOrThrow({
          where: { id: booking.id },
          select: { checkIn: true, checkOut: true },
        });
        expect(dbDateToYmd(stored.checkOut)).toBe(checkOutYmd);
        expect(dbDateToYmd(stored.checkIn)).toBe(addDaysToYmd(checkOutYmd, -2));
      }
    });
  });

  it("round-trips a `@db.Date` through Postgres in a zone far ahead of UTC", async () => {
    await inZone("Pacific/Kiritimati", async () => {
      for (const checkOutYmd of dates) {
        const booking = await confirmedStay(checkOutYmd);
        const stored = await db.booking.findUniqueOrThrow({
          where: { id: booking.id },
          select: { checkOut: true },
        });
        expect(dbDateToYmd(stored.checkOut)).toBe(checkOutYmd);
      }
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the phone is told a booking costs.
 *
 * Audit L2: the response used to hand out `nightlyRate`, `cleaningFee` and `totalPrice`
 * side by side with nothing marking the first as derived. `nightlyRate` is a rounded
 * effective average, so a client that multiplied it by the nights disagreed with the
 * authoritative total — by a cent here, by more on a longer, more uneven stay.
 *
 * The response now names every figure, and the named figures add up. Booked against
 * real per-night overrides of 100 / 100 / 101 so the average genuinely cannot
 * reconstruct the subtotal; a test using flat nights would pass either way.
 *
 * Real Postgres, as everywhere else in this suite; only the mobile transport helper is
 * stubbed, because the real one reaches next-auth, which does not resolve under vitest.
 */

const mocks = vi.hoisted(() => ({
  actor: { current: { id: "", isHost: true, role: "USER" } },
}));

vi.mock("@/lib/mobile-api", () => ({
  requireMobileHost: async () => ({ user: mocks.actor.current }),
  mobileOptions: () => new Response(null, { status: 204 }),
  mobileJson: (_request: Request, body: unknown, init?: { status?: number }) =>
    Response.json(body, { status: init?.status ?? 200 }),
}));

import { db } from "@/lib/db";
import { createBooking } from "@/lib/services/booking.service";
import { dbDateToYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "@/lib/services/__tests__/test-helpers";
import { GET as getBooking } from "@/app/api/mobile/v1/bookings/[id]/route";

const url = "https://example.test/api/mobile/v1/bookings/x";

interface MobileBookingPrice {
  currency: string;
  totalPrice: number;
  accommodationSubtotal: number;
  averageNightlyRate: number;
  cleaningFee: number;
  serviceFee: number;
  nightlyRate: number;
}

async function read(id: string): Promise<MobileBookingPrice> {
  const response = await getBooking(new Request(url), {
    params: Promise.resolve({ id }),
  });
  if (!response) throw new Error("the route handler returned no response");
  expect(response.status).toBe(200);
  const body = (await response.json()) as { booking: MobileBookingPrice };
  return body.booking;
}

describe("mobile booking detail pricing", () => {
  let fixtures: TestFixtures | undefined;

  beforeEach(() => {
    mocks.actor.current = { id: "", isHost: true, role: "USER" };
  });

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  /** A three-night stay priced 100 / 100 / 101, on a listing with a 10 cleaning fee. */
  async function setup(nightlyPrices: number[]) {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };

    // Far out, so these fixtures cannot collide with another suite's stay on the
    // shared local Postgres.
    const checkIn = new Date();
    checkIn.setUTCHours(0, 0, 0, 0);
    checkIn.setUTCDate(checkIn.getUTCDate() + 910);
    const checkOut = new Date(checkIn);
    checkOut.setUTCDate(checkOut.getUTCDate() + nightlyPrices.length);

    const startYmd = dbDateToYmd(checkIn);
    await db.listingDatePrice.createMany({
      data: nightlyPrices.map((nightlyRate, index) => {
        const date = new Date(ymdToDbDate(startYmd));
        date.setUTCDate(date.getUTCDate() + index);
        return { listingId: listing.id, date, nightlyRate };
      }),
    });

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      party: { adults: 2 },
    });

    mocks.actor.current = { id: host.id, isHost: true, role: "USER" };
    return booking;
  }

  it("names every component, and the named components add up to the total", async () => {
    const booking = await setup([100, 100, 101]);

    const price = await read(booking.id);

    expect(price.currency).toBe("EUR");
    expect(price.totalPrice).toBe(311);
    expect(price.accommodationSubtotal).toBe(301);
    expect(price.cleaningFee).toBe(10);
    expect(price.serviceFee).toBe(0);
    expect(
      price.accommodationSubtotal + price.cleaningFee + price.serviceFee,
    ).toBeCloseTo(price.totalPrice, 2);
  });

  it("labels the average as an average and does not let it reconstruct the stay", async () => {
    const booking = await setup([100, 100, 101]);

    const price = await read(booking.id);

    // 301 / 3, rounded to the cent — and 100.33 * 3 is 300.99, which is the whole point.
    expect(price.averageNightlyRate).toBe(100.33);
    expect(price.averageNightlyRate * 3).not.toBe(price.accommodationSubtotal);
  });

  it("still carries the deprecated nightlyRate for older app builds", async () => {
    const booking = await setup([100, 100, 101]);

    const price = await read(booking.id);

    const stored = await db.booking.findUnique({
      where: { id: booking.id },
      select: { nightlyRate: true },
    });
    expect(price.nightlyRate).toBe(Number(stored?.nightlyRate));
    expect(price.nightlyRate).toBe(price.averageNightlyRate);
  });

  it("reports the currency the booking is quoted in", async () => {
    const booking = await setup([100, 100, 101]);

    const stored = await db.booking.findUnique({
      where: { id: booking.id },
      select: { currency: true },
    });
    expect((await read(booking.id)).currency).toBe(stored?.currency);
  });
});

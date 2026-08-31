import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The mobile host booking views.
 *
 * These are the only booking endpoints the mobile app has — it is a host app, so there
 * is no mobile creation path to carry a party through — and both of them used to answer
 * with `guestCount` alone. A host reading a request on their phone had exactly the gap
 * H4 describes: "3 guests" for two adults, an infant and a dog.
 *
 * Real Postgres, as everywhere else in this suite; the mobile transport helper is the
 * one thing stubbed, because what is under test is the payload these routes build.
 */

const mocks = vi.hoisted(() => ({
  hostId: { current: "" },
}));

// The whole helper, not a spy over it: the real module reaches next-auth, which does
// not resolve under vitest. What is under test is the payload these routes build, and
// the CORS/bearer plumbing is exercised by the mobile API's own suite.
vi.mock("@/lib/mobile-api", () => ({
  requireMobileHost: async () => ({
    user: { id: mocks.hostId.current, isHost: true, role: "USER" },
  }),
  mobileOptions: () => new Response(null, { status: 204 }),
  mobileJson: (_request: Request, body: unknown, init?: { status?: number }) =>
    Response.json(body, { status: init?.status ?? 200 }),
}));

import { db } from "@/lib/db";
import { createBooking } from "@/lib/services/booking.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "@/lib/services/__tests__/test-helpers";
import { GET as listBookings } from "@/app/api/mobile/v1/bookings/route";
import { GET as getBooking } from "@/app/api/mobile/v1/bookings/[id]/route";

function stayDates(offsetDays: number) {
  const checkIn = new Date();
  checkIn.setUTCHours(0, 0, 0, 0);
  checkIn.setUTCDate(checkIn.getUTCDate() + offsetDays);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return { checkIn, checkOut };
}

const request = () =>
  new Request("https://example.test/api/mobile/v1/bookings");

async function detail(id: string) {
  const response = await getBooking(request(), {
    params: Promise.resolve({ id }),
  });
  return (response as Response).json();
}

describe("mobile host booking views carry the party", () => {
  let fixtures: TestFixtures | undefined;

  beforeEach(() => {
    mocks.hostId.current = "";
  });

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    mocks.hostId.current = host.id;
    await db.listing.update({
      where: { id: listing.id },
      data: { petPolicy: "ALLOWED" },
    });
    return { listing, guest };
  }

  it("returns the four counters beside the capacity count on the detail view", async () => {
    const { listing, guest } = await setup();
    const { checkIn, checkOut } = stayDates(810);
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      party: { adults: 2, children: 1, infants: 1, pets: 1 },
    });

    const body = await detail(booking.id);

    // Capacity is still adults + children, exactly as it always was; the rest arrives
    // alongside it rather than inside it.
    expect(body.booking.guestCount).toBe(3);
    expect(body.booking.party).toEqual({
      adults: 2,
      children: 1,
      infants: 1,
      pets: 1,
    });
  });

  it("returns the party in the list view too", async () => {
    const { listing, guest } = await setup();
    const { checkIn, checkOut } = stayDates(820);
    await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      party: { adults: 1, infants: 2 },
    });

    // Every branch of the handler answers; the union only widens because the shared
    // mobile helpers are typed loosely.
    const listed = (await listBookings(request())) as Response;
    const body = (await listed.json()) as {
      bookings: Array<{
        listingId: string;
        guestCount: number;
        party: unknown;
      }>;
    };
    const row = body.bookings.find(
      (booking) => booking.listingId === listing.id,
    );

    expect(row).toBeDefined();
    expect(row?.guestCount).toBe(1);
    expect(row?.party).toEqual({ adults: 1, children: 0, infants: 2, pets: 0 });
  });

  it("answers null — never four zeroes — for a booking whose party was never recorded", async () => {
    const { listing, guest } = await setup();
    const { checkIn, checkOut } = stayDates(830);
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      guestCount: 2,
    });

    const body = await detail(booking.id);

    expect(body.booking.guestCount).toBe(2);
    // A client must be able to tell "this guest brought no pet" from "nobody ever
    // asked this guest", and only null can say the second one.
    expect(body.booking.party).toBeNull();
  });
});

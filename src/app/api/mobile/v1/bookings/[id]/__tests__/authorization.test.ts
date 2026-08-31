import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Who may read and who may act on one booking from the phone.
 *
 * This asymmetry is deliberate and predates the `"SUPERADMIN"` cleanup: `GET` widens to
 * every booking for an admin (the where-clause drops the `listing: { hostId }` filter),
 * while `PATCH` never widens — it passes `access.user.id` straight to the booking
 * services, which each refuse a caller who does not own the listing. Removing the dead
 * `role === "SUPERADMIN"` arm must not have moved that line in either direction, so
 * both halves are pinned here.
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
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "@/lib/services/__tests__/test-helpers";
import {
  GET as getBooking,
  PATCH as patchBooking,
} from "@/app/api/mobile/v1/bookings/[id]/route";

const url = "https://example.test/api/mobile/v1/bookings/x";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** The handlers' declared return widens to `Response | undefined` because the mocked
 *  `requireMobile*` helper above never produces the rejection branch, so TypeScript
 *  narrows that arm to `never`. Assert rather than cast — a handler that answered with
 *  nothing is a real failure, not a typing detail to paper over. */
function answered(response: Response | undefined): Response {
  if (!response) throw new Error("the route handler returned no response");
  return response;
}

async function read(id: string) {
  const response = answered(await getBooking(new Request(url), params(id)));
  return { status: response.status, body: await response.json() };
}

async function mutate(id: string, body: Record<string, unknown>) {
  const response = answered(
    await patchBooking(
      new Request(url, { method: "PATCH", body: JSON.stringify(body) }),
      params(id)
    )
  );
  return { status: response.status, body: await response.json() };
}

describe("mobile booking detail authorization", () => {
  let fixtures: TestFixtures | undefined;
  let otherHostId = "";

  beforeEach(() => {
    mocks.actor.current = { id: "", isHost: true, role: "USER" };
  });

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
    if (otherHostId) {
      await db.user.deleteMany({ where: { id: otherHostId } });
      otherHostId = "";
    }
  });

  /** A pending booking on a listing owned by someone other than the caller. */
  async function setup() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    const otherHost = await createTestGuest();
    otherHostId = otherHost.id;
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
    checkIn.setUTCDate(checkIn.getUTCDate() + 900);
    const checkOut = new Date(checkIn);
    checkOut.setUTCDate(checkOut.getUTCDate() + 2);

    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn,
      checkOut,
      party: { adults: 2 },
    });

    return { host, booking, otherHost };
  }

  it("still lets an admin read a booking on someone else's listing", async () => {
    const { booking, otherHost } = await setup();
    mocks.actor.current = { id: otherHost.id, isHost: false, role: "ADMIN" };

    const { status, body } = await read(booking.id);

    expect(status).toBe(200);
    expect(body.booking.id).toBe(booking.id);
    // The acceptance question belongs to the listing's own host, and an admin is not
    // offered it even though they can see the booking.
    expect(body.booking.acceptance).toBeNull();
  });

  it("still lets the listing's own host read their booking", async () => {
    const { host, booking } = await setup();
    mocks.actor.current = { id: host.id, isHost: true, role: "USER" };

    const { status, body } = await read(booking.id);

    expect(status).toBe(200);
    expect(body.booking.id).toBe(booking.id);
  });

  it("still hides the booking from a host who does not own the listing", async () => {
    const { booking, otherHost } = await setup();
    mocks.actor.current = { id: otherHost.id, isHost: true, role: "USER" };

    const { status } = await read(booking.id);

    expect(status).toBe(404);
  });

  it("does not let an admin accept a booking they do not host", async () => {
    const { booking, otherHost } = await setup();
    mocks.actor.current = { id: otherHost.id, isHost: false, role: "ADMIN" };

    const { status } = await mutate(booking.id, {
      action: "confirm",
      paymentDecision: "NO_INSTRUCTIONS",
    });

    expect(status).toBe(400);
    const after = await db.booking.findUnique({ where: { id: booking.id } });
    expect(after?.status).toBe("PENDING");
  });

  it("does not let an admin reject a booking they do not host", async () => {
    const { booking, otherHost } = await setup();
    mocks.actor.current = { id: otherHost.id, isHost: false, role: "ADMIN" };

    const { status, body } = await mutate(booking.id, {
      action: "reject",
      reason: "Not mine to decline",
    });

    expect(status).toBe(400);
    expect(body.error).toMatch(/your own listings/i);
    const after = await db.booking.findUnique({ where: { id: booking.id } });
    expect(after?.status).toBe("PENDING");
  });

  it("does not let an admin cancel a booking they do not host", async () => {
    const { booking, otherHost } = await setup();
    mocks.actor.current = { id: otherHost.id, isHost: false, role: "ADMIN" };

    const { status } = await mutate(booking.id, {
      action: "cancel",
      reason: "Not mine to cancel",
    });

    expect(status).toBe(400);
    const after = await db.booking.findUnique({ where: { id: booking.id } });
    expect(after?.status).toBe("PENDING");
  });
});

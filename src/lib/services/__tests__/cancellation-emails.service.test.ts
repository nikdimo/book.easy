import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

import { db } from "@/lib/db";
import {
  cancelBooking,
  confirmBooking,
  createBooking,
} from "@/lib/services/booking.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * #11: a cancellation reaches both parties by email, whoever caused it.
 *
 * `cancelBooking` chose between exactly two email kinds with a single ternary:
 * `HOST_CANCELLED_BY_GUEST` when the guest cancelled, `GUEST_CANCELLED` otherwise. Three
 * causes, two branches — so "admin" fell into the else and a support cancellation emailed
 * the guest and sent the host nothing. A guest who cancelled their own booking got no
 * email either, and therefore no written record of a settlement they may owe or be owed.
 *
 * In-app notifications already handled all three cases for both sides
 * (`notification.service.ts`). Email is the channel that reaches someone who is not
 * logged in, which is why this asymmetry was the one a party actually noticed.
 *
 * The assertions are on the durable outbox rather than on sending: what the outbox holds
 * is what will be delivered, and it is the thing the defect was in.
 *
 * Integration test against the real local Postgres. Run `npm run db:docker` first if the
 * container isn't up.
 */
describe("cancellation emails", () => {
  let fixtures: TestFixtures | undefined;
  const bookingIds: string[] = [];

  afterEach(async () => {
    if (bookingIds.length > 0) {
      await db.bookingEmailDelivery.deleteMany({
        where: { bookingId: { in: bookingIds } },
      });
      await db.bookingPaymentRequest.deleteMany({
        where: { bookingId: { in: bookingIds.splice(0) } },
      });
    }
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function confirmedBooking() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    // A real support actor: `cancelBooking` refuses "admin" from anyone who is not an
    // active ADMIN, which is exactly the guard that made this branch easy to overlook.
    const admin = await createTestGuest();
    await db.user.update({
      where: { id: admin.id },
      data: { role: "ADMIN", isActive: true },
    });
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id, admin.id],
    };
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 1,
      checkIn: new Date("2029-11-10T00:00:00.000Z"),
      checkOut: new Date("2029-11-13T00:00:00.000Z"),
    });
    bookingIds.push(booking.id);
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    // Only what the cancellation itself enqueues.
    await db.bookingEmailDelivery.deleteMany({ where: { bookingId: booking.id } });
    return { host, guest, admin, booking };
  }

  const queuedKinds = async (bookingId: string) =>
    (
      await db.bookingEmailDelivery.findMany({
        where: { bookingId },
        select: { kind: true },
      })
    )
      .map((row) => row.kind)
      .sort();

  it("tells the host and the guest when support cancels", async () => {
    const { admin, booking } = await confirmedBooking();

    await cancelBooking(booking.id, admin.id, "admin", "Safety review");

    expect(await queuedKinds(booking.id)).toEqual([
      "GUEST_CANCELLED",
      "HOST_CANCELLED_BY_ADMIN",
    ]);
  });

  /** Not the guest-cancelled kind: it would tell the host something untrue. */
  it("does not tell the host their guest cancelled when support did", async () => {
    const { admin, booking } = await confirmedBooking();

    await cancelBooking(booking.id, admin.id, "admin", "Safety review");

    expect(await queuedKinds(booking.id)).not.toContain("HOST_CANCELLED_BY_GUEST");
  });

  it("gives the guest their own record when they cancel", async () => {
    const { guest, booking } = await confirmedBooking();

    await cancelBooking(booking.id, guest.id, "guest", "Plans changed");

    expect(await queuedKinds(booking.id)).toEqual([
      "GUEST_CANCELLED",
      "HOST_CANCELLED_BY_GUEST",
    ]);
  });

  /** A host who cancelled it themselves needs no email about their own action. */
  it("tells only the guest when the host cancels", async () => {
    const { host, booking } = await confirmedBooking();

    await cancelBooking(booking.id, host.id, "host", "Boiler failed");

    expect(await queuedKinds(booking.id)).toEqual(["GUEST_CANCELLED"]);
  });

  /** The outbox key is (bookingId, kind), so nothing can be queued twice. */
  it("queues one delivery per kind", async () => {
    const { admin, booking } = await confirmedBooking();

    await cancelBooking(booking.id, admin.id, "admin", "Safety review");

    const rows = await db.bookingEmailDelivery.findMany({
      where: { bookingId: booking.id },
      select: { kind: true },
    });
    expect(new Set(rows.map((row) => row.kind)).size).toBe(rows.length);
  });
});

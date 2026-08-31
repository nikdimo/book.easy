import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  cancelBooking,
  completePastBookings,
  confirmBooking,
  createBooking,
  expirePendingBookings,
  rejectBooking,
} from "@/lib/services/booking.service";
import {
  reconcileBookingTimelineEvents,
  recordBookingTimelineEvent,
} from "@/lib/services/booking-timeline.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * The booking's permanent history, and its durability (M7).
 *
 * `recordBookingTimelineEvent` used to be reached from exactly one place —
 * `notifyBookingEvent` — which every caller invokes through a wrapper that swallows
 * errors. A booking could change state and lose its history entry with nothing
 * reporting it, and the reconciler could only ever recover the *current* status: any
 * intermediate state lost that way was gone for good.
 *
 * So what these pin is not "an entry exists eventually". It is that the entry is
 * written by the same transaction as the status, which makes three things testable that
 * were not before: the entry is there the instant the call returns, a failed history
 * write takes the status change down with it, and a failed notification afterwards
 * takes nothing at all.
 *
 * Integration tests against the real local Postgres, like their neighbours in this
 * directory. Run `npm run db:docker` first if the container isn't up.
 */

const hooks = vi.hoisted(() => ({
  failTimelineWrite: false,
  failNotifications: false,
}));

vi.mock("@/lib/services/booking-timeline.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/booking-timeline.service")>();
  return {
    ...actual,
    recordBookingTimelineEvent: (
      ...args: Parameters<typeof actual.recordBookingTimelineEvent>
    ) =>
      hooks.failTimelineWrite
        ? Promise.reject(new Error("forced timeline write failure"))
        : actual.recordBookingTimelineEvent(...args),
  };
});

vi.mock("@/lib/services/notification.service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/services/notification.service")>();
  return {
    ...actual,
    notifyBookingEvent: (...args: Parameters<typeof actual.notifyBookingEvent>) =>
      hooks.failNotifications
        ? Promise.reject(new Error("forced notification failure"))
        : actual.notifyBookingEvent(...args),
  };
});

interface TimelineRow {
  type: string;
  actorId: string | null;
  actor: string | null;
}

async function timelineOf(bookingId: string): Promise<TimelineRow[]> {
  const rows = await db.bookingTimelineEvent.findMany({ where: { bookingId } });
  return rows
    .map((row) => ({
      type: row.type as string,
      actorId: row.actorId,
      actor: (row.data as { actor?: string } | null)?.actor ?? null,
    }))
    .sort((left, right) => left.type.localeCompare(right.type));
}

const emailKinds = async (bookingId: string) =>
  (
    await db.bookingEmailDelivery.findMany({
      where: { bookingId },
      select: { kind: true },
    })
  )
    .map(({ kind }) => kind as string)
    .sort();

const holdCount = (bookingId: string) =>
  db.availabilityBlock.count({
    where: { bookingId, blockType: "BOOKING_HOLD" },
  });

describe("booking lifecycle history", () => {
  const fixtures: TestFixtures[] = [];

  beforeEach(() => {
    hooks.failTimelineWrite = false;
    hooks.failNotifications = false;
  });

  afterEach(async () => {
    hooks.failTimelineWrite = false;
    hooks.failNotifications = false;
    for (const fixture of fixtures.splice(0)) await cleanupTestFixtures(fixture);
  });

  async function setup() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    const fixture: TestFixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    fixtures.push(fixture);
    return { host, listing, guest, fixture };
  }

  let stayCursor = 0;
  /** A distinct future stay per call, so nothing in this file collides on the hold. */
  function nextStay() {
    stayCursor += 1;
    const start = new Date(Date.UTC(2035, 0, 1));
    start.setUTCDate(start.getUTCDate() + stayCursor * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 3);
    return { checkIn: start, checkOut: end };
  }

  async function request(listingId: string, guestId: string) {
    return createBooking({ listingId, guestId, guestCount: 2, ...nextStay() });
  }

  /** Pushes the host's answer deadline into the past, hold and all. */
  async function makeOverdue(bookingId: string) {
    await db.booking.update({
      where: { id: bookingId },
      data: { responseDueAt: new Date(Date.now() - 60_000) },
    });
  }

  // ── The transitions ───────────────────────────────────────────────────────────

  it("records the request in the same transaction as the booking", async () => {
    const { listing, guest } = await setup();

    const booking = await request(listing.id, guest.id);

    // No await, no polling, no retry: the moment `createBooking` returns, the history
    // entry has committed with it. This is the assertion the old fire-and-forget write
    // could not pass.
    expect(await timelineOf(booking.id)).toEqual([
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
    // …alongside the rest of what that transaction owns.
    expect(await holdCount(booking.id)).toBe(1);
    expect(await emailKinds(booking.id)).toEqual([
      "GUEST_REQUEST_RECEIVED",
      "HOST_NEW_REQUEST",
    ]);
  });

  it("records the acceptance against the host who made it", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);

    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });

    expect(await timelineOf(booking.id)).toEqual([
      { type: "CONFIRMED", actorId: host.id, actor: "HOST" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
    expect(await emailKinds(booking.id)).toContain("GUEST_CONFIRMED");
    // An accepted stay keeps its dates.
    expect(await holdCount(booking.id)).toBe(1);
  });

  it("records the decline against the host who made it", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);

    await rejectBooking(booking.id, host.id, "Not available after all");

    expect(await timelineOf(booking.id)).toEqual([
      { type: "REJECTED", actorId: host.id, actor: "HOST" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
    expect(await emailKinds(booking.id)).toContain("GUEST_REJECTED");
    expect(await holdCount(booking.id)).toBe(0);
  });

  it("records a guest cancellation as the guest's", async () => {
    const { listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);

    await cancelBooking(booking.id, guest.id, "guest");

    expect(await timelineOf(booking.id)).toEqual([
      { type: "CANCELLED_BY_GUEST", actorId: guest.id, actor: "GUEST" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
    expect(await emailKinds(booking.id)).toContain("HOST_CANCELLED_BY_GUEST");
    expect(await holdCount(booking.id)).toBe(0);
  });

  it("records a host cancellation as the host's", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);

    await cancelBooking(booking.id, host.id, "host", "Boiler broke");

    expect(await timelineOf(booking.id)).toEqual([
      { type: "CANCELLED_BY_HOST", actorId: host.id, actor: "HOST" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
    expect(await emailKinds(booking.id)).toContain("GUEST_CANCELLED");
    expect(await holdCount(booking.id)).toBe(0);
  });

  it("records an admin cancellation as support's, not as the host's", async () => {
    const { listing, guest, fixture } = await setup();
    const admin = await db.user.create({
      data: {
        email: `test-admin-${randomUUID()}@example.test`,
        name: "Test Admin",
        role: "ADMIN",
        isActive: true,
      },
    });
    fixture.extraUserIds.push(admin.id);
    const booking = await request(listing.id, guest.id);

    await cancelBooking(booking.id, admin.id, "admin", "Support intervention");

    // H2's distinction, now durable: support's cancellation is its own event with its
    // own actor, and cannot be read back as something the host did.
    expect(await timelineOf(booking.id)).toEqual([
      { type: "CANCELLED_BY_ADMIN", actorId: admin.id, actor: "ADMIN" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
  });

  it("records the automatic expiry as a system transition", async () => {
    const { listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);
    await makeOverdue(booking.id);

    expect(await expirePendingBookings()).toBeGreaterThanOrEqual(1);

    expect(await timelineOf(booking.id)).toEqual([
      // Nobody declined it. `actorId: null` alone could not say that — an erased
      // guest's cancellation is also null — so the role carries the fact.
      { type: "EXPIRED", actorId: null, actor: "SYSTEM" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
    expect(await emailKinds(booking.id)).toContain("GUEST_EXPIRED");
    expect(await holdCount(booking.id)).toBe(0);
  });

  it("records the expiry a late acceptance runs into, and no acceptance", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);
    await makeOverdue(booking.id);

    await expect(
      confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" }),
    ).rejects.toThrow(/expired/i);

    expect(await timelineOf(booking.id)).toEqual([
      { type: "EXPIRED", actorId: null, actor: "SYSTEM" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
    ).toBe("EXPIRED");
  });

  it("records the expiry a late decline runs into, and no decline", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);
    await makeOverdue(booking.id);

    await expect(
      rejectBooking(booking.id, host.id, "Too late"),
    ).rejects.toThrow(/expired/i);

    expect(await timelineOf(booking.id)).toEqual([
      { type: "EXPIRED", actorId: null, actor: "SYSTEM" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
  });

  it("records completion as a system transition", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    // The stay is over. Written directly because there is no way to book into the past.
    await db.booking.update({
      where: { id: booking.id },
      data: {
        checkIn: new Date("2024-01-01"),
        checkOut: new Date("2024-01-04"),
      },
    });

    await completePastBookings();

    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
    ).toBe("COMPLETED");
    expect(await timelineOf(booking.id)).toEqual([
      { type: "COMPLETED", actorId: null, actor: "SYSTEM" },
      { type: "CONFIRMED", actorId: host.id, actor: "HOST" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
  });

  // The erasure path also moves a booking's status (a pending request the erased guest
  // made is withdrawn). Its history entry is covered in account-deletion.service.test.ts,
  // beside the rest of the erasure, so that two Serializable erasure transactions are
  // never issued from two test files running in parallel.

  // ── Durability ────────────────────────────────────────────────────────────────

  it("rolls the whole request back when its history entry cannot be written", async () => {
    const { listing, guest } = await setup();
    hooks.failTimelineWrite = true;

    await expect(request(listing.id, guest.id)).rejects.toThrow(
      "forced timeline write failure",
    );

    // Not "a booking without history" — no booking, no hold, no queued mail at all.
    expect(await db.booking.count({ where: { listingId: listing.id } })).toBe(0);
    expect(
      await db.availabilityBlock.count({ where: { listingId: listing.id } }),
    ).toBe(0);
  });

  it("rolls the acceptance back when its history entry cannot be written", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);
    hooks.failTimelineWrite = true;

    await expect(
      confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" }),
    ).rejects.toThrow("forced timeline write failure");

    const stored = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(stored.status).toBe("PENDING");
    expect(stored.acceptedAt).toBeNull();
    expect(await timelineOf(booking.id)).toEqual([
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
    // Everything else the acceptance would have written went back with it.
    expect(await emailKinds(booking.id)).not.toContain("GUEST_CONFIRMED");
    expect(
      await db.bookingPaymentRequest.count({ where: { bookingId: booking.id } }),
    ).toBe(0);
  });

  it("rolls the completion back when its history entry cannot be written", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    await db.booking.update({
      where: { id: booking.id },
      data: {
        checkIn: new Date("2024-03-01"),
        checkOut: new Date("2024-03-04"),
      },
    });
    hooks.failTimelineWrite = true;

    await expect(completePastBookings()).rejects.toThrow("forced timeline write failure");

    // The stay is not quietly over with no record of it having ended: the status went
    // back with the entry, so the next sweep tries again and the review window this
    // status opens has not been opened behind the history's back.
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
    ).toBe("CONFIRMED");
    expect(await timelineOf(booking.id)).toEqual([
      { type: "CONFIRMED", actorId: host.id, actor: "HOST" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
    expect(await db.reviewInvitation.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  it("rolls the cancellation back when its history entry cannot be written", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);
    hooks.failTimelineWrite = true;

    await expect(
      cancelBooking(booking.id, host.id, "host", "Boiler broke"),
    ).rejects.toThrow("forced timeline write failure");

    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
    ).toBe("PENDING");
    // The dates are still held, because the cancellation that would have released them
    // never happened.
    expect(await holdCount(booking.id)).toBe(1);
  });

  it("keeps status and history when the notification afterwards fails", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);
    hooks.failNotifications = true;

    // The failure is swallowed, as it always was — what changed is that it no longer
    // takes the record with it.
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });

    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
    ).toBe("CONFIRMED");
    expect(await timelineOf(booking.id)).toEqual([
      { type: "CONFIRMED", actorId: host.id, actor: "HOST" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
    // And the delivery really did fail: nothing reached the guest's notification list.
    expect(
      await db.notification.count({
        where: { userId: guest.id, type: "BOOKING_CONFIRMED" },
      }),
    ).toBe(0);
  });

  // ── Nothing written for a transition that did not happen ──────────────────────

  it("writes nothing for an unauthorized attempt", async () => {
    const { listing, guest, fixture } = await setup();
    const stranger = await createTestGuest();
    fixture.extraUserIds.push(stranger.id);
    const booking = await request(listing.id, guest.id);

    await expect(cancelBooking(booking.id, stranger.id, "guest")).rejects.toThrow();
    await expect(rejectBooking(booking.id, stranger.id, "no")).rejects.toThrow();
    await expect(
      confirmBooking(booking.id, stranger.id, { decision: "NO_INSTRUCTIONS" }),
    ).rejects.toThrow();
    // "admin" without the role is a refusal too, not a privilege.
    await expect(cancelBooking(booking.id, stranger.id, "admin")).rejects.toThrow();

    expect(await timelineOf(booking.id)).toEqual([
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
  });

  it("writes nothing extra for a stale second attempt", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);
    await cancelBooking(booking.id, guest.id, "guest");

    // The host's screen was open across the cancellation.
    await expect(
      confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" }),
    ).rejects.toThrow();
    await expect(cancelBooking(booking.id, host.id, "host")).rejects.toThrow();

    expect(await timelineOf(booking.id)).toEqual([
      { type: "CANCELLED_BY_GUEST", actorId: guest.id, actor: "GUEST" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
  });

  it("lets exactly one of two concurrent acceptances through, with one event", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);

    const results = await Promise.allSettled([
      confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" }),
      confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.bookingTimelineEvent.count({
        where: { bookingId: booking.id, type: "CONFIRMED" },
      }),
    ).toBe(1);
  });

  it("lets exactly one of two concurrent cancellations through, with one event", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);

    const results = await Promise.allSettled([
      cancelBooking(booking.id, guest.id, "guest"),
      cancelBooking(booking.id, host.id, "host", "Boiler broke"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    // One transition, one event — and never one of each kind.
    expect(
      await db.bookingTimelineEvent.count({ where: { bookingId: booking.id } }),
    ).toBe(2);
  });

  it("adds nothing on a repeated expiry sweep", async () => {
    const { listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);
    await makeOverdue(booking.id);

    await expirePendingBookings();
    const respondedAt = (
      await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    ).respondedAt;
    await expirePendingBookings();
    await expirePendingBookings();

    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).respondedAt,
    ).toEqual(respondedAt);
    expect(await timelineOf(booking.id)).toHaveLength(2);
    expect(
      await db.bookingEmailDelivery.count({
        where: { bookingId: booking.id, kind: "GUEST_EXPIRED" },
      }),
    ).toBe(1);
  });

  it("adds nothing on a repeated completion sweep, or on a replayed write", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    await db.booking.update({
      where: { id: booking.id },
      data: {
        checkIn: new Date("2024-02-01"),
        checkOut: new Date("2024-02-04"),
      },
    });

    await completePastBookings();
    await completePastBookings();
    // And the mechanism itself refuses a replay, which is what keeps the reconciler
    // still running on the cron from doubling up on what the transactions wrote.
    expect(
      await recordBookingTimelineEvent(db, {
        bookingId: booking.id,
        type: "COMPLETED",
        actor: { role: "SYSTEM" },
      }),
    ).toBe(false);

    expect(await timelineOf(booking.id)).toEqual([
      { type: "COMPLETED", actorId: null, actor: "SYSTEM" },
      { type: "CONFIRMED", actorId: host.id, actor: "HOST" },
      { type: "REQUESTED", actorId: guest.id, actor: "GUEST" },
    ]);
  });

  it("does not let extra context replace authoritative timeline metadata", async () => {
    const { host, listing, guest } = await setup();
    const booking = await request(listing.id, guest.id);

    await recordBookingTimelineEvent(db, {
      bookingId: booking.id,
      type: "REJECTED",
      actor: { role: "HOST", userId: host.id },
      data: { actor: "SYSTEM", version: 999, reason: "TEST_CONTEXT" },
    });

    const event = await db.bookingTimelineEvent.findFirstOrThrow({
      where: { bookingId: booking.id, type: "REJECTED" },
    });
    expect(event.data).toEqual({
      actor: "HOST",
      version: 1,
      reason: "TEST_CONTEXT",
    });
  });

  it("continues reconciling valid rows when one backfill parent disappears", async () => {
    const { listing, guest } = await setup();
    const first = await request(listing.id, guest.id);
    const second = await request(listing.id, guest.id);
    await db.bookingTimelineEvent.deleteMany({
      where: { bookingId: { in: [first.id, second.id] } },
    });

    // A bulk INSERT is atomic, so the first failure writes nothing. The first retry
    // represents the vanished parent; the other half must still be repaired.
    const createMany = vi
      .spyOn(db.bookingTimelineEvent, "createMany")
      .mockRejectedValueOnce({ code: "P2003" })
      .mockRejectedValueOnce({ code: "P2003" });

    await expect(reconcileBookingTimelineEvents(2)).resolves.toBe(1);
    expect(
      await db.bookingTimelineEvent.count({
        where: { bookingId: { in: [first.id, second.id] }, type: "REQUESTED" },
      }),
    ).toBe(1);
    createMany.mockRestore();
  });
});

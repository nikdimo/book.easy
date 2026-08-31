import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getHostAttentionSummary } from "@/lib/services/attention.service";
import { createBooking } from "@/lib/services/booking.service";
import { ymdToDbDate } from "@/lib/utils/date-only";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

describe("host payment-arrangements attention", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("remains until the host has reviewed methods, deposits, and cancellation", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    };

    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      incompletePaymentArrangements: { id: listing.id, title: listing.title },
      incompletePaymentArrangementCount: 1,
    });

    // An explicit direct-arrangement answer is still incomplete until the host also
    // explicitly chooses the deposit policy (including "no deposit").
    await db.listing.update({
      where: { id: listing.id },
      data: { paymentMethodsReviewedAt: new Date() },
    });
    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      incompletePaymentArrangements: { id: listing.id },
      incompletePaymentArrangementCount: 1,
    });

    await db.listing.update({
      where: { id: listing.id },
      data: { depositPoliciesReviewedAt: new Date() },
    });
    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      incompletePaymentArrangements: { id: listing.id },
      incompletePaymentArrangementCount: 1,
    });

    await db.listing.update({
      where: { id: listing.id },
      data: {
        freeCancellationDaysBeforeCheckIn: 7,
        cancellationPolicyReviewedAt: new Date(),
      },
    });
    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      incompletePaymentArrangements: null,
      incompletePaymentArrangementCount: 0,
    });
  });

  it("does not resurrect a task for an archived listing", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [],
    };

    await db.listing.update({
      where: { id: listing.id },
      data: { status: "ARCHIVED" },
    });

    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      incompletePaymentArrangements: null,
      incompletePaymentArrangementCount: 0,
    });
  });
});

/**
 * Today's request counter is the first thing a host sees, and it has to agree with the
 * reservation list they land on when they tap it. The list expires overdue requests
 * before reading (`getHostBookings`, `getHostReservations`); this pins that the summary
 * now does the same, through the same service — a request the host can no longer answer
 * is not work, and a counter that still claims it is sends them to an empty screen.
 *
 * Integration test against the real local Postgres, like its neighbours in this
 * directory. Run `npm run db:docker` first if the container isn't up.
 */
describe("host pending-request attention", () => {
  const fixtures: TestFixtures[] = [];

  afterEach(async () => {
    for (const fixture of fixtures.splice(0)) await cleanupTestFixtures(fixture);
  });

  async function setupHost() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures.push({
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    });
    return { host, listing, guest };
  }

  /** A request whose answer deadline is already behind us, hold and all. */
  async function overdueRequest(
    listingId: string,
    guestId: string,
    stay: { checkIn: string; checkOut: string },
  ) {
    const booking = await createBooking({
      listingId,
      guestId,
      checkIn: ymdToDbDate(stay.checkIn),
      checkOut: ymdToDbDate(stay.checkOut),
      guestCount: 2,
    });
    await db.booking.update({
      where: { id: booking.id },
      data: { responseDueAt: new Date(Date.now() - 60_000) },
    });
    return booking;
  }

  it("counts a request the host still has time to answer", async () => {
    const { host, listing, guest } = await setupHost();

    await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: ymdToDbDate("2033-03-01"),
      checkOut: ymdToDbDate("2033-03-04"),
      guestCount: 2,
    });

    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      pendingBookings: 1,
      total: 1,
    });
  });

  it("does not count a request whose deadline has passed", async () => {
    const { host, listing, guest } = await setupHost();
    const booking = await overdueRequest(listing.id, guest.id, {
      checkIn: "2033-04-01",
      checkOut: "2033-04-04",
    });

    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      pendingBookings: 0,
      total: 0,
    });
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: booking.id } })).status,
    ).toBe("EXPIRED");
  });

  it("releases the hold on the request it expires", async () => {
    const { host, listing, guest } = await setupHost();
    const booking = await overdueRequest(listing.id, guest.id, {
      checkIn: "2033-05-01",
      checkOut: "2033-05-04",
    });

    // The dates are still held while the request is live — that is what makes the
    // release below meaningful rather than vacuous.
    expect(
      await db.availabilityBlock.count({
        where: { bookingId: booking.id, blockType: "BOOKING_HOLD" },
      }),
    ).toBe(1);

    await getHostAttentionSummary(host.id);

    expect(await db.availabilityBlock.count({ where: { bookingId: booking.id } })).toBe(0);
  });

  it("stays idempotent across repeated dashboard reads", async () => {
    const { host, listing, guest } = await setupHost();
    const booking = await overdueRequest(listing.id, guest.id, {
      checkIn: "2033-06-01",
      checkOut: "2033-06-04",
    });

    await getHostAttentionSummary(host.id);
    const firstResponse = (
      await db.booking.findUniqueOrThrow({ where: { id: booking.id } })
    ).respondedAt;

    await getHostAttentionSummary(host.id);
    await getHostAttentionSummary(host.id);

    const [stored, expiredDeliveries, timelineEvents, guestNotifications] =
      await Promise.all([
        db.booking.findUniqueOrThrow({ where: { id: booking.id } }),
        db.bookingEmailDelivery.count({
          where: { bookingId: booking.id, kind: "GUEST_EXPIRED" },
        }),
        db.bookingTimelineEvent.count({ where: { bookingId: booking.id, type: "EXPIRED" } }),
        db.notification.count({
          where: { userId: guest.id, type: "BOOKING_REJECTED" },
        }),
      ]);

    // Re-reading the dashboard must not re-expire what is already expired: the moment
    // of expiry stands, and the guest is told once.
    expect(stored.respondedAt).toEqual(firstResponse);
    expect(expiredDeliveries).toBe(1);
    expect(timelineEvents).toBe(1);
    expect(guestNotifications).toBe(1);
  });

  it("counts the live request and drops the overdue one when both exist", async () => {
    const { host, listing, guest } = await setupHost();

    const expired = await overdueRequest(listing.id, guest.id, {
      checkIn: "2033-07-01",
      checkOut: "2033-07-04",
    });
    const active = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: ymdToDbDate("2033-08-01"),
      checkOut: ymdToDbDate("2033-08-04"),
      guestCount: 2,
    });

    expect(await getHostAttentionSummary(host.id)).toMatchObject({
      pendingBookings: 1,
      total: 1,
    });

    const [expiredRow, activeRow] = await Promise.all([
      db.booking.findUniqueOrThrow({ where: { id: expired.id } }),
      db.booking.findUniqueOrThrow({ where: { id: active.id } }),
    ]);
    expect(expiredRow.status).toBe("EXPIRED");
    expect(activeRow.status).toBe("PENDING");
  });

  it("keeps each host's count to their own requests", async () => {
    const first = await setupHost();
    const second = await setupHost();

    await overdueRequest(first.listing.id, first.guest.id, {
      checkIn: "2033-09-01",
      checkOut: "2033-09-04",
    });
    const secondActive = await createBooking({
      listingId: second.listing.id,
      guestId: second.guest.id,
      checkIn: ymdToDbDate("2033-09-01"),
      checkOut: ymdToDbDate("2033-09-04"),
      guestCount: 2,
    });

    // The sweep is marketplace-wide, so reading one host's dashboard must not disturb
    // another host's live request — nor borrow its count.
    expect(await getHostAttentionSummary(first.host.id)).toMatchObject({
      pendingBookings: 0,
      total: 0,
    });
    expect(await getHostAttentionSummary(second.host.id)).toMatchObject({
      pendingBookings: 1,
      total: 1,
    });
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: secondActive.id } })).status,
    ).toBe("PENDING");
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cancelBooking,
  confirmBooking,
  createBooking,
} from "@/lib/services/booking.service";
import { processBookingPaymentReminders } from "@/lib/services/booking-payment-reminder.service";
import { parseCancellationSettlementSnapshot } from "@/lib/payments/cancellation-policy";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * #2 and #14: one vocabulary for `*_REPORTED`, two thresholds for acting on it.
 *
 * Settlement counted a guest's unverified report as money received — opening a real
 * `AWAITING_REFUND` and escalating "refund due" notices at the host — while the reminder
 * job refused to trust the same status and kept nudging the guest who had already
 * reported. This file holds both halves of the settled answer at once:
 *
 *  - the obligation is still opened from a report (the guest keeps their refund), but it
 *    is recorded as *claimed*, with the confirmed portion stated;
 *  - the report discharges the reporter's own prompt and nothing else — guest reminders
 *    stop, the host's overdue notice continues until they confirm.
 *
 * Integration test against the real local Postgres, like its neighbours in this
 * directory. Run `npm run db:docker` first if the container isn't up.
 */
describe("what a reported payment establishes", () => {
  let fixtures: TestFixtures | undefined;
  const bookingIds: string[] = [];

  afterEach(async () => {
    if (bookingIds.length > 0) {
      await db.bookingPaymentRequest.deleteMany({
        where: { bookingId: { in: bookingIds.splice(0) } },
      });
    }
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  /** A confirmed booking with a 200 advance against a 1000-ish total. */
  async function setup() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    await db.listing.update({
      where: { id: listing.id },
      data: {
        cancellationPolicyReviewedAt: new Date(),
        freeCancellationDaysBeforeCheckIn: 7,
      },
    });
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 1,
      checkIn: new Date("2029-09-10T00:00:00.000Z"),
      checkOut: new Date("2029-09-14T00:00:00.000Z"),
    });
    bookingIds.push(booking.id);
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    return { host, listing, guest, booking };
  }

  it("opens the refund from a report, and records it as claimed", async () => {
    const { host, guest, booking } = await setup();
    await db.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: "PAYMENT_REPORTED" },
    });

    await cancelBooking(booking.id, guest.id, "guest", "Plans changed");

    const after = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    // The guest keeps their refund. A host who stays silent cannot make it disappear.
    expect(Number(after.accommodationRefundAmount)).toBeGreaterThan(0);
    expect(after.accommodationRefundStatus).toBe("AWAITING_REFUND");
    // And it is on the record as a claim rather than as an established debt.
    const settlement = parseCancellationSettlementSnapshot(
      after.cancellationSettlementSnapshot,
    );
    expect(settlement?.version).toBe(2);
    expect(settlement?.refundBasis).toBe("CLAIMED");
    expect(settlement?.confirmedRefundAmount).toBe(0);
    expect(host.id).toBeTruthy();
  });

  it("records a confirmed payment's refund as confirmed", async () => {
    const { guest, booking } = await setup();
    await db.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: "PAYMENT_CONFIRMED" },
    });

    await cancelBooking(booking.id, guest.id, "guest", "Plans changed");

    const after = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    const settlement = parseCancellationSettlementSnapshot(
      after.cancellationSettlementSnapshot,
    );
    expect(settlement?.refundBasis).toBe("CONFIRMED");
    expect(settlement?.confirmedRefundAmount).toBe(
      Number(after.accommodationRefundAmount),
    );
  });
});

/**
 * #14: the reminder split. A guest who has said they sent the money is being told, by a
 * reminder that will not stop, that their own report did not count.
 */
describe("payment reminders after a guest reports sending", () => {
  let fixtures: TestFixtures | undefined;
  const bookingIds: string[] = [];

  afterEach(async () => {
    if (bookingIds.length > 0) {
      await db.bookingPaymentRequest.deleteMany({
        where: { bookingId: { in: bookingIds.splice(0) } },
      });
    }
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function overdueRequest() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 1,
      checkIn: new Date("2029-09-10T00:00:00.000Z"),
      checkOut: new Date("2029-09-12T00:00:00.000Z"),
    });
    bookingIds.push(booking.id);
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    const request = await db.bookingPaymentRequest.findFirstOrThrow({
      where: { bookingId: booking.id, type: "ACCOMMODATION_BALANCE" },
    });
    await db.bookingPaymentRequest.update({
      where: { id: request.id },
      data: {
        status: "SENT",
        dueAt: new Date("2029-09-01T00:00:00.000Z"),
        reviewedAt: new Date("2029-08-28T00:00:00.000Z"),
        sentAt: new Date("2029-08-28T00:00:00.000Z"),
      },
    });
    return { host, guest, booking, request };
  }

  const deliveries = (requestId: string, recipientId: string) =>
    db.bookingPaymentReminderDelivery.count({
      where: { requestId, recipientId },
    });

  it("stops nudging the guest but keeps the host's overdue notice", async () => {
    const { host, guest, booking, request } = await overdueRequest();
    await db.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: "PAYMENT_REPORTED" },
    });

    // Well past the deadline, so this is the OVERDUE pass — the one that reaches both.
    await processBookingPaymentReminders(new Date("2029-09-05T10:00:00.000Z"));

    expect(await deliveries(request.id, guest.id)).toBe(0);
    expect(await deliveries(request.id, host.id)).toBe(1);
  });

  it("still reminds a guest who has not reported anything", async () => {
    const { host, guest, booking, request } = await overdueRequest();
    expect(booking.paymentStatus).toBe("UNTRACKED");

    await processBookingPaymentReminders(new Date("2029-09-05T10:00:00.000Z"));

    expect(await deliveries(request.id, guest.id)).toBe(1);
    expect(await deliveries(request.id, host.id)).toBe(1);
  });

  it("stops both once the host confirms", async () => {
    const { host, guest, booking, request } = await overdueRequest();
    await db.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: "PAYMENT_CONFIRMED" },
    });

    await processBookingPaymentReminders(new Date("2029-09-05T10:00:00.000Z"));

    expect(await deliveries(request.id, guest.id)).toBe(0);
    expect(await deliveries(request.id, host.id)).toBe(0);
  });

  /** The damage-deposit track uses the same vocabulary, so it splits the same way. */
  it("applies the same split to a reported damage deposit", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    await db.listing.update({
      where: { id: listing.id },
      data: {
        depositPoliciesCurrency: "EUR",
        depositPoliciesReviewedAt: new Date(),
        damageDepositEnabled: true,
        damageDepositType: "FIXED",
        damageDepositValue: 150,
        damageDepositDueTiming: "AFTER_ACCEPTANCE",
        damageDepositReturnDaysAfterCheckout: 3,
      },
    });
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 1,
      checkIn: new Date("2029-10-10T00:00:00.000Z"),
      checkOut: new Date("2029-10-12T00:00:00.000Z"),
    });
    bookingIds.push(booking.id);
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    const request = await db.bookingPaymentRequest.findFirstOrThrow({
      where: { bookingId: booking.id, type: "DAMAGE_DEPOSIT" },
    });
    await db.bookingPaymentRequest.update({
      where: { id: request.id },
      data: {
        status: "SENT",
        dueAt: new Date("2029-10-01T00:00:00.000Z"),
        reviewedAt: new Date("2029-09-28T00:00:00.000Z"),
        sentAt: new Date("2029-09-28T00:00:00.000Z"),
      },
    });
    await db.booking.update({
      where: { id: booking.id },
      data: { damageDepositStatus: "DEPOSIT_REPORTED" },
    });

    await processBookingPaymentReminders(new Date("2029-10-05T10:00:00.000Z"));

    expect(await deliveries(request.id, guest.id)).toBe(0);
    expect(await deliveries(request.id, host.id)).toBe(1);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  cancelBooking,
  confirmBooking,
  createBooking,
} from "@/lib/services/booking.service";
import { recordBookingPaymentEvent } from "@/lib/services/booking-payment-status.service";
import { todayYmd } from "@/lib/utils/date-only";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

describe("cancellation settlement", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  it("opens a full host-cancellation refund and settles it only through reports", async () => {
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
        freeCancellationDaysBeforeCheckIn: 7,
        cancellationPolicyReviewedAt: new Date(),
        advancePaymentEnabled: true,
        advancePaymentType: "FIXED",
        advancePaymentValue: 60,
        advancePaymentDueTiming: "AFTER_ACCEPTANCE",
        depositPoliciesCurrency: "EUR",
        depositPoliciesReviewedAt: new Date(),
      },
    });
    const checkIn = new Date();
    checkIn.setUTCHours(0, 0, 0, 0);
    checkIn.setUTCDate(checkIn.getUTCDate() + 20);
    const checkOut = new Date(checkIn);
    checkOut.setUTCDate(checkOut.getUTCDate() + 2);
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 1,
      checkIn,
      checkOut,
    });
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
      privateRecord: {
        amount: 60,
        transactionDate: todayYmd(),
      },
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
    });

    await cancelBooking(booking.id, host.id, "host", "Property unavailable");
    const cancelled = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { paymentRequests: true },
    });
    expect(cancelled).toMatchObject({
      status: "CANCELLED_BY_HOST",
      accommodationRefundStatus: "AWAITING_REFUND",
    });
    expect(Number(cancelled.accommodationRefundAmount)).toBe(60);
    expect(
      cancelled.paymentRequests.find((request) => request.type === "ADVANCE_PAYMENT")
        ?.status,
    ).toBe("SETTLED");
    expect(
      cancelled.paymentRequests.find(
        (request) => request.type === "ACCOMMODATION_BALANCE",
      )?.status,
    ).toBe("CANCELLED");

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_REPORT_ACCOMMODATION_REFUND_SENT",
      privateRecord: {
        amount: 60,
        transactionDate: todayYmd(),
        reference: "REFUND-60",
      },
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_CONFIRM_ACCOMMODATION_REFUND_RECEIVED",
    });
    await expect(
      db.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).resolves.toMatchObject({ accommodationRefundStatus: "REFUND_CONFIRMED" });
  });

  it("does not trust a caller that merely labels itself as an administrator", async () => {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    const supportUser = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id, supportUser.id],
    };
    const checkIn = new Date();
    checkIn.setUTCDate(checkIn.getUTCDate() + 20);
    const checkOut = new Date(checkIn);
    checkOut.setUTCDate(checkOut.getUTCDate() + 2);
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 1,
      checkIn,
      checkOut,
    });

    await expect(
      cancelBooking(booking.id, supportUser.id, "admin", "Support cancellation"),
    ).rejects.toThrow("active administrator");
    await db.user.update({
      where: { id: supportUser.id },
      data: { role: "ADMIN" },
    });
    await cancelBooking(
      booking.id,
      supportUser.id,
      "admin",
      "Support cancellation",
    );
    await expect(
      db.booking.findUniqueOrThrow({ where: { id: booking.id } }),
    ).resolves.toMatchObject({ status: "CANCELLED_BY_ADMIN" });
  });

  it("does not strand a transfer the guest reported just before cancellation", async () => {
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
        freeCancellationDaysBeforeCheckIn: 7,
        cancellationPolicyReviewedAt: new Date(),
        advancePaymentEnabled: true,
        advancePaymentType: "FIXED",
        advancePaymentValue: 60,
        advancePaymentDueTiming: "AFTER_ACCEPTANCE",
        depositPoliciesCurrency: "EUR",
        depositPoliciesReviewedAt: new Date(),
      },
    });
    const checkIn = new Date();
    checkIn.setUTCDate(checkIn.getUTCDate() + 20);
    const checkOut = new Date(checkIn);
    checkOut.setUTCDate(checkOut.getUTCDate() + 2);
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 1,
      checkIn,
      checkOut,
    });
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
      privateRecord: { amount: 60, transactionDate: todayYmd() },
    });

    await cancelBooking(booking.id, host.id, "host", "Property unavailable");

    const cancelled = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(cancelled.accommodationRefundStatus).toBe("AWAITING_REFUND");
    expect(Number(cancelled.accommodationRefundAmount)).toBe(60);
  });
});

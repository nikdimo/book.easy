import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { confirmBooking, createBooking } from "@/lib/services/booking.service";
import {
  getBookingPaymentProgress,
  recordBookingPaymentEvent,
} from "@/lib/services/booking-payment-status.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

function futureStay() {
  const checkIn = new Date();
  checkIn.setUTCHours(0, 0, 0, 0);
  checkIn.setUTCDate(checkIn.getUTCDate() + 700);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return { checkIn, checkOut };
}

describe("manual booking payment progress", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    const outsider = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id, outsider.id],
    };
    await db.listing.update({
      where: { id: listing.id },
      data: {
        depositPolicy: "FIXED",
        depositPurpose: "DAMAGE_SECURITY",
        depositValue: "100",
        depositCurrency: "EUR",
        depositDueTiming: "AFTER_ACCEPTANCE",
        depositReturnDaysAfterCheckout: 7,
        depositPolicyReviewedAt: new Date(),
      },
    });
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 2,
      ...futureStay(),
    });
    await confirmBooking(booking.id, host.id);
    return { host, guest, outsider, booking };
  }

  it("keeps participant reads private", async () => {
    const { host, guest, outsider, booking } = await setup();
    const hostView = await getBookingPaymentProgress(booking.id, host.id);
    expect(hostView).toMatchObject({
      paymentStatus: "AWAITING_PAYMENT",
      depositStatus: "AWAITING_DEPOSIT",
    });
    expect(Number(hostView?.depositAmount)).toBe(100);
    expect(await getBookingPaymentProgress(booking.id, guest.id)).not.toBeNull();
    expect(await getBookingPaymentProgress(booking.id, outsider.id)).toBeNull();
  });

  it("records guest report and host confirmation as separate append-only events", async () => {
    const { host, guest, booking } = await setup();
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_PAYMENT_SENT",
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_PAYMENT_RECEIVED",
    });

    const progress = await getBookingPaymentProgress(booking.id, guest.id);
    expect(progress?.paymentStatus).toBe("PAYMENT_CONFIRMED");
    expect(progress?.paymentStatusEvents).toHaveLength(2);
    expect(progress?.paymentStatusEvents.map((event) => event.actorId)).toEqual([
      guest.id,
      host.id,
    ]);
    expect(progress?.paymentStatusEvents.map((event) => event.eventType)).toEqual([
      "GUEST_REPORT_PAYMENT_SENT",
      "HOST_CONFIRM_PAYMENT_RECEIVED",
    ]);
  });

  it("enforces actor permissions and accepted-booking state", async () => {
    const { guest, outsider, booking } = await setup();
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event: "HOST_CONFIRM_PAYMENT_RECEIVED",
      }),
    ).rejects.toThrow("Only the host");
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: outsider.id,
        event: "GUEST_REPORT_PAYMENT_SENT",
      }),
    ).rejects.toThrow("Booking not found");

    await db.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED_BY_GUEST" },
    });
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event: "GUEST_REPORT_PAYMENT_SENT",
      }),
    ).rejects.toThrow("accepted booking");
  });

  it("requires receipt before a security deposit can be returned or retained", async () => {
    const { host, guest, booking } = await setup();
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_REPORT_DEPOSIT_RETURNED",
      }),
    ).rejects.toThrow("Confirm receiving");

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_DEPOSIT_SENT",
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_DEPOSIT_RECEIVED",
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_REPORT_DEPOSIT_RETURNED",
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_CONFIRM_DEPOSIT_RETURNED",
    });

    const progress = await getBookingPaymentProgress(booking.id, host.id);
    expect(progress?.depositStatus).toBe("RETURN_CONFIRMED");
    expect(progress?.paymentStatusEvents).toHaveLength(4);
  });

  it("does not move terminal payment states backward", async () => {
    const { host, booking } = await setup();
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_PAYMENT_RECEIVED",
    });

    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_MARK_PAYMENT_DUE",
      }),
    ).rejects.toThrow("already started");
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_MARK_PAYMENT_NOT_REQUIRED",
      }),
    ).rejects.toThrow("reported or confirmed");
  });

  it("only allows return and retention tracking for security deposits", async () => {
    const { host, booking } = await setup();
    await db.booking.update({
      where: { id: booking.id },
      data: {
        depositPolicySnapshot: {
          version: 1,
          status: "REVIEWED",
          policy: "FIXED",
          purpose: "ADVANCE_PAYMENT",
          value: "100",
          currency: "EUR",
          dueTiming: "AFTER_ACCEPTANCE",
          dueDaysBeforeCheckIn: null,
          returnDaysAfterCheckout: null,
        },
        depositStatus: "DEPOSIT_CONFIRMED",
      },
    });

    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_REPORT_DEPOSIT_RETURNED",
      }),
    ).rejects.toThrow("damage/security deposit");
  });
});

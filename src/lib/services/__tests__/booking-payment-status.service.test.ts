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

type PolicyChoice = "none" | "advance" | "damage" | "both";

function listingPolicies(
  choice: PolicyChoice,
  overrides: Record<string, unknown> = {},
) {
  return {
    advancePaymentEnabled: choice === "advance" || choice === "both",
    advancePaymentType: "FIXED" as const,
    advancePaymentValue: "60",
    advancePaymentDueTiming: "AFTER_ACCEPTANCE" as const,
    damageDepositEnabled: choice === "damage" || choice === "both",
    damageDepositType: "FIXED" as const,
    damageDepositValue: "100",
    damageDepositDueTiming: "AFTER_ACCEPTANCE" as const,
    damageDepositReturnDaysAfterCheckout: 7,
    depositPoliciesCurrency: "EUR",
    depositPoliciesReviewedAt: new Date(),
    ...overrides,
  };
}

describe("manual booking payment progress", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup(
    choice: PolicyChoice = "both",
    policyOverrides: Record<string, unknown> = {},
    confirm = true,
  ) {
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
      data: listingPolicies(choice, policyOverrides),
    });
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 2,
      ...futureStay(),
    });
    if (confirm) await confirmBooking(booking.id, host.id);
    return { host, guest, outsider, booking };
  }

  it("does not claim money is due while the booking request is still pending", async () => {
    const { host, booking } = await setup("both", {}, false);

    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "UNTRACKED",
      damageDepositStatus: "UNTRACKED",
    });
  });

  it("keeps later-due policies untracked until the host marks each one due", async () => {
    const { host, booking } = await setup("both", {
      advancePaymentDueTiming: "DAYS_BEFORE_CHECK_IN",
      advancePaymentDueDaysBeforeCheckIn: 14,
      damageDepositDueTiming: "AT_CHECK_IN",
      damageDepositDueDaysBeforeCheckIn: null,
    });

    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "UNTRACKED",
      damageDepositStatus: "UNTRACKED",
    });

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_MARK_ADVANCE_PAYMENT_DUE",
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_MARK_DAMAGE_DEPOSIT_DUE",
    });

    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "AWAITING_PAYMENT",
      damageDepositStatus: "AWAITING_DEPOSIT",
    });
  });

  it("freezes and tracks both policies independently", async () => {
    const { host, guest, outsider, booking } = await setup("both");
    const hostView = await getBookingPaymentProgress(booking.id, host.id);
    expect(hostView).toMatchObject({
      paymentStatus: "AWAITING_PAYMENT",
      advancePaymentStatus: "AWAITING_PAYMENT",
      damageDepositStatus: "AWAITING_DEPOSIT",
    });
    // Two separate amounts, never one combined figure.
    expect(Number(hostView?.advancePaymentAmount)).toBe(60);
    expect(Number(hostView?.damageDepositAmount)).toBe(100);
    expect(await getBookingPaymentProgress(booking.id, guest.id)).not.toBeNull();
    expect(await getBookingPaymentProgress(booking.id, outsider.id)).toBeNull();
  });

  it("settles the damage track when only an advance payment is configured", async () => {
    const { host, booking } = await setup("advance");
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "AWAITING_PAYMENT",
      damageDepositStatus: "NOT_REQUIRED",
      damageDepositAmount: null,
    });
  });

  it("settles the advance track when only a damage deposit is configured", async () => {
    const { host, booking } = await setup("damage");
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "NOT_REQUIRED",
      advancePaymentAmount: null,
      damageDepositStatus: "AWAITING_DEPOSIT",
    });
  });

  it("settles both tracks when the host asks for neither", async () => {
    const { host, booking } = await setup("none");
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "NOT_REQUIRED",
      damageDepositStatus: "NOT_REQUIRED",
      advancePaymentAmount: null,
      damageDepositAmount: null,
    });
  });

  it("moves one track without touching the other", async () => {
    const { host, guest, booking } = await setup("both");
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
    });

    const afterDamage = await getBookingPaymentProgress(booking.id, host.id);
    expect(afterDamage).toMatchObject({
      damageDepositStatus: "DEPOSIT_REPORTED",
      // Reporting the damage deposit says nothing about the advance payment.
      advancePaymentStatus: "AWAITING_PAYMENT",
    });

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
    });
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "PAYMENT_CONFIRMED",
      damageDepositStatus: "DEPOSIT_REPORTED",
    });
  });

  it("records each change as a separate actor-labelled event", async () => {
    const { host, guest, booking } = await setup("both");
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
    });

    const progress = await getBookingPaymentProgress(booking.id, guest.id);
    expect(progress?.paymentStatusEvents).toHaveLength(2);
    expect(progress?.paymentStatusEvents.map((event) => event.actorId)).toEqual([
      guest.id,
      host.id,
    ]);
    expect(progress?.paymentStatusEvents.map((event) => event.eventType)).toEqual([
      "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
      "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
    ]);
    // The audit row carries both tracks, so a reader can see what did not change too.
    expect(progress?.paymentStatusEvents.at(-1)).toMatchObject({
      advancePaymentStatus: "PAYMENT_CONFIRMED",
      damageDepositStatus: "AWAITING_DEPOSIT",
    });
  });

  it("enforces actor permissions on each track", async () => {
    const { guest, host, outsider, booking } = await setup("both");
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event: "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED",
      }),
    ).rejects.toThrow("Only the host");
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
      }),
    ).rejects.toThrow("Only the guest");
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: outsider.id,
        event: "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
      }),
    ).rejects.toThrow("Booking not found");
  });

  it("refuses an advance-payment update the booking never froze", async () => {
    const { guest, booking } = await setup("damage");
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
      }),
    ).rejects.toThrow("does not require an advance payment");
  });

  it("refuses a damage-deposit update the booking never froze", async () => {
    const { host, booking } = await setup("advance");
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED",
      }),
    ).rejects.toThrow("does not require a damage deposit");
  });

  it("only lets the damage deposit be returned, and only after it is received", async () => {
    const { host, guest, booking } = await setup("both");
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED",
      }),
    ).rejects.toThrow("Confirm receiving");

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED",
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED",
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED",
    });

    const progress = await getBookingPaymentProgress(booking.id, host.id);
    expect(progress?.damageDepositStatus).toBe("RETURN_CONFIRMED");
    // The advance payment has its own life and was never touched by any of that.
    expect(progress?.advancePaymentStatus).toBe("AWAITING_PAYMENT");
    expect(progress?.paymentStatusEvents).toHaveLength(4);
  });

  it("lets a host retain a received damage deposit", async () => {
    const { host, guest, booking } = await setup("damage");
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED",
    });
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_MARK_DAMAGE_DEPOSIT_RETAINED",
    });
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      damageDepositStatus: "RETAINED",
    });
  });

  it("does not move a confirmed advance payment backward", async () => {
    const { host, booking } = await setup("advance");
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
    });
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_MARK_ADVANCE_PAYMENT_DUE",
      }),
    ).rejects.toThrow("already started");
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
      }),
    ).rejects.toThrow("already been confirmed");
  });

  it("keeps the whole-booking payment track working alongside the two policies", async () => {
    const { host, guest, booking } = await setup("both");
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
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      paymentStatus: "PAYMENT_CONFIRMED",
      advancePaymentStatus: "AWAITING_PAYMENT",
      damageDepositStatus: "AWAITING_DEPOSIT",
    });
  });

  it("refuses any update once the booking is no longer accepted", async () => {
    const { guest, booking } = await setup("both");
    await db.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED_BY_GUEST" },
    });
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event: "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
      }),
    ).rejects.toThrow("accepted booking");
  });
});

describe("V1 bookings and deprecated event names", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  /** A booking whose terms were frozen before the deposit split. */
  async function setupV1(purpose: "ADVANCE_PAYMENT" | "DAMAGE_SECURITY") {
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
      guestCount: 2,
      ...futureStay(),
    });
    await confirmBooking(booking.id, host.id);
    await db.booking.update({
      where: { id: booking.id },
      data: {
        depositPolicySnapshot: {
          version: 1,
          status: "REVIEWED",
          policy: "FIXED",
          purpose,
          value: "100",
          currency: "EUR",
          dueTiming: "AFTER_ACCEPTANCE",
          dueDaysBeforeCheckIn: null,
          returnDaysAfterCheckout: purpose === "DAMAGE_SECURITY" ? 7 : null,
        },
        advancePaymentStatus:
          purpose === "ADVANCE_PAYMENT" ? "AWAITING_PAYMENT" : "NOT_REQUIRED",
        damageDepositStatus:
          purpose === "DAMAGE_SECURITY" ? "AWAITING_DEPOSIT" : "NOT_REQUIRED",
        advancePaymentAmount: purpose === "ADVANCE_PAYMENT" ? "100" : null,
        damageDepositAmount: purpose === "DAMAGE_SECURITY" ? "100" : null,
      },
    });
    return { host, guest, booking };
  }

  it("reads a frozen V1 advance payment through the new tracks", async () => {
    const { host, guest, booking } = await setupV1("ADVANCE_PAYMENT");
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
    });
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "PAYMENT_REPORTED",
      damageDepositStatus: "NOT_REQUIRED",
    });
  });

  it("resolves a deprecated V1 event name onto the one track that exists", async () => {
    const damage = await setupV1("DAMAGE_SECURITY");
    await recordBookingPaymentEvent({
      bookingId: damage.booking.id,
      actorId: damage.guest.id,
      event: "GUEST_REPORT_DEPOSIT_SENT",
    });
    const progress = await getBookingPaymentProgress(
      damage.booking.id,
      damage.host.id,
    );
    expect(progress?.damageDepositStatus).toBe("DEPOSIT_REPORTED");
    // The audit trail records the resolved name, never the ambiguous legacy one.
    expect(progress?.paymentStatusEvents.at(-1)?.eventType).toBe(
      "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
    );
  });

  it("refuses a deprecated name when both policies exist, rather than guessing", async () => {
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
        advancePaymentEnabled: true,
        advancePaymentType: "FIXED",
        advancePaymentValue: "60",
        damageDepositEnabled: true,
        damageDepositType: "FIXED",
        damageDepositValue: "100",
        depositPoliciesCurrency: "EUR",
        depositPoliciesReviewedAt: new Date(),
      },
    });
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      guestCount: 2,
      ...futureStay(),
    });
    await confirmBooking(booking.id, host.id);

    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event: "GUEST_REPORT_DEPOSIT_SENT",
      }),
    ).rejects.toThrow("Reload the page");
  });
});

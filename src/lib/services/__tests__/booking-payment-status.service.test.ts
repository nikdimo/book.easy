import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { confirmBooking, createBooking } from "@/lib/services/booking.service";
import {
  getBookingPaymentProgress,
  recordBookingPaymentEvent as recordBookingPaymentEventService,
} from "@/lib/services/booking-payment-status.service";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";
import { todayYmd } from "@/lib/utils/date-only";

function futureStay() {
  const checkIn = new Date();
  checkIn.setUTCHours(0, 0, 0, 0);
  checkIn.setUTCDate(checkIn.getUTCDate() + 700);
  const checkOut = new Date(checkIn);
  checkOut.setUTCDate(checkOut.getUTCDate() + 2);
  return { checkIn, checkOut };
}

const REPORT_EVENTS = new Set([
  "GUEST_REPORT_PAYMENT_SENT",
  "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
  "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
  "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED",
  "HOST_MARK_DAMAGE_DEPOSIT_RETAINED",
  "HOST_REPORT_ACCOMMODATION_REFUND_SENT",
  "GUEST_REPORT_DEPOSIT_SENT",
  "HOST_REPORT_DEPOSIT_RETURNED",
  "HOST_MARK_DEPOSIT_RETAINED",
]);

/** Existing transition tests care about state movement; supply the mandatory private
 * transaction record centrally so each case does not repeat irrelevant form data. */
async function recordBookingPaymentEvent(
  input: Parameters<typeof recordBookingPaymentEventService>[0],
) {
  if (input.privateRecord || !REPORT_EVENTS.has(input.event)) {
    return recordBookingPaymentEventService(input);
  }
  const booking = await db.booking.findUniqueOrThrow({
    where: { id: input.bookingId },
    select: {
      totalPrice: true,
      advancePaymentAmount: true,
      damageDepositAmount: true,
      accommodationRefundAmount: true,
    },
  });
  const event = input.event;
  const amount =
    event === "GUEST_REPORT_ADVANCE_PAYMENT_SENT"
      ? Number(booking.advancePaymentAmount ?? 0)
      : event === "GUEST_REPORT_PAYMENT_SENT"
        ? Math.max(
            0,
            Number(booking.totalPrice) - Number(booking.advancePaymentAmount ?? 0),
          )
        : event === "HOST_REPORT_ACCOMMODATION_REFUND_SENT"
          ? Number(booking.accommodationRefundAmount ?? 0)
          : event === "GUEST_REPORT_DEPOSIT_SENT" &&
              Number(booking.damageDepositAmount ?? 0) === 0
            ? Number(booking.advancePaymentAmount ?? 0)
            : Number(booking.damageDepositAmount ?? 0);
  return recordBookingPaymentEventService({
    ...input,
    privateRecord: {
      amount,
      transactionDate: todayYmd(),
      retainedReason: event.includes("RETAINED") ? "Test retention reason" : null,
    },
  });
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
    if (confirm) await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
    return { host, guest, outsider, booking };
  }

  it("stores transaction details privately beside an immutable status event", async () => {
    const { guest, booking } = await setup("advance");

    const reported = await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
      privateRecord: {
        amount: 60,
        transactionDate: todayYmd(),
        reference: "BANK-123",
        note: "Sent from my account",
      },
    });
    if (!("eventId" in reported)) throw new Error("Expected a new payment event");

    const event = await db.bookingPaymentStatusEvent.findUniqueOrThrow({
      where: { id: reported.eventId },
    });
    expect(Object.keys(event)).not.toContain("reference");
    expect(Object.keys(event)).not.toContain("note");
    await expect(
      db.bookingPaymentPrivateRecord.findUniqueOrThrow({
        where: { eventId: event.id },
      }),
    ).resolves.toMatchObject({
      track: "ADVANCE_PAYMENT",
      reference: "BANK-123",
      note: "Sent from my account",
    });
  });

  it("rejects a report that bypasses the form without amount and date", async () => {
    const { guest, booking } = await setup("advance");

    await expect(
      recordBookingPaymentEventService({
        bookingId: booking.id,
        actorId: guest.id,
        event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
      }),
    ).rejects.toThrow("transaction amount and date");
    await expect(
      db.bookingPaymentPrivateRecord.count({ where: { bookingId: booking.id } }),
    ).resolves.toBe(0);
  });

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
    await db.user.update({
      where: { id: outsider.id },
      data: { role: "ADMIN" },
    });
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

  it("does not create a send-instructions task when no instructions are needed", async () => {
    const { booking } = await setup("none");
    const requests = await db.bookingPaymentRequest.findMany({
      where: { bookingId: booking.id },
      select: { status: true, instructionsSnapshot: true },
    });

    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every((request) => request.status === "SENT")).toBe(true);
    expect(
      requests.every(
        (request) =>
          (request.instructionsSnapshot as { kind?: string } | null)?.kind ===
          "NO_INSTRUCTIONS",
      ),
    ).toBe(true);
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
      db.bookingPaymentRequest.findUniqueOrThrow({
        where: {
          bookingId_type: {
            bookingId: booking.id,
            type: "ADVANCE_PAYMENT",
          },
        },
      }),
    ).resolves.toMatchObject({ status: "SETTLED" });
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

  // ---- After checkout ----------------------------------------------------------
  //
  // `completePastBookings` flips CONFIRMED → COMPLETED the moment checkout passes, and
  // payment tracking used to die with it. Three of the thirteen events are post-checkout
  // by definition, and cash handed over at the property is normally confirmed then too.

  /** What `completePastBookings` does once checkout has passed. */
  async function complete(bookingId: string) {
    await db.booking.update({
      where: { id: bookingId },
      data: { status: "COMPLETED" },
    });
  }

  it("records the damage deposit return after the stay has completed", async () => {
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
    // The guest leaves; the host returns the deposit within the promised window.
    await complete(booking.id);

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

    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      status: "COMPLETED",
      damageDepositStatus: "RETURN_CONFIRMED",
    });
  });

  it("lets a host retain the deposit after the stay has completed", async () => {
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
    await complete(booking.id);

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_MARK_DAMAGE_DEPOSIT_RETAINED",
    });

    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      damageDepositStatus: "RETAINED",
    });
  });

  it("settles cash taken at the property after the booking has completed", async () => {
    const { host, guest, booking } = await setup("none");
    await db.booking.update({
      where: { id: booking.id },
      data: { selectedPaymentMethod: "CASH_AT_PROPERTY" },
    });
    // Cash changes hands during the stay; both sides record it once the stay is over.
    await complete(booking.id);

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_PAYMENT_SENT",
    });
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      paymentStatus: "PAYMENT_REPORTED",
    });

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_PAYMENT_RECEIVED",
    });
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      paymentStatus: "PAYMENT_CONFIRMED",
    });
  });

  it("still lets the host confirm a late advance payment after completion", async () => {
    const { host, booking } = await setup("advance");
    await complete(booking.id);

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
    });
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "PAYMENT_CONFIRMED",
    });
  });

  it("will not reopen collection on a stay that is already over", async () => {
    // Both tracks are left UNTRACKED by these due timings, so the refusal below is the
    // phase rule talking and not the track's own state.
    const { host, booking } = await setup("both", {
      advancePaymentDueTiming: "DAYS_BEFORE_CHECK_IN",
      advancePaymentDueDaysBeforeCheckIn: 14,
      damageDepositDueTiming: "AT_CHECK_IN",
      damageDepositDueDaysBeforeCheckIn: null,
    });
    await complete(booking.id);

    for (const event of [
      "HOST_MARK_ADVANCE_PAYMENT_DUE",
      "HOST_MARK_DAMAGE_DEPOSIT_DUE",
    ] as const) {
      await expect(
        recordBookingPaymentEvent({
          bookingId: booking.id,
          actorId: host.id,
          event,
        }),
      ).rejects.toThrow("already completed");
    }

    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "UNTRACKED",
      damageDepositStatus: "UNTRACKED",
    });
  });

  it("still refuses every update on a booking nobody accepted", async () => {
    const { host, booking } = await setup("both", {}, false);
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED",
      }),
    ).rejects.toThrow("accepted booking");
  });

  // ---- Waiving the price -------------------------------------------------------
  //
  // The advance payment is part of `totalPrice`. Waiving the price used to leave the
  // advance sitting at AWAITING_PAYMENT, so the guest was still being asked to send
  // money toward a price the host had just given up on.

  it("settles an open advance payment when the host waives the price", async () => {
    const { host, booking } = await setup("advance");
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "AWAITING_PAYMENT",
    });

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_MARK_PAYMENT_NOT_REQUIRED",
    });

    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      paymentStatus: "NOT_REQUIRED",
      advancePaymentStatus: "NOT_REQUIRED",
    });
    await expect(
      db.bookingPaymentRequest.findMany({
        where: {
          bookingId: booking.id,
          type: { in: ["ADVANCE_PAYMENT", "ACCOMMODATION_BALANCE"] },
        },
        select: { type: true, status: true },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { type: "ACCOMMODATION_BALANCE", status: "CANCELLED" },
        { type: "ADVANCE_PAYMENT", status: "CANCELLED" },
      ]),
    );
  });

  it("does not unsay an advance payment the guest already reported", async () => {
    const { host, guest, booking } = await setup("advance");
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: guest.id,
      event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
    });

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_MARK_PAYMENT_NOT_REQUIRED",
    });

    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      paymentStatus: "NOT_REQUIRED",
      // Real money the guest says they sent. Waiving the rest does not erase it.
      advancePaymentStatus: "PAYMENT_REPORTED",
    });
  });

  it("does not unsay an advance payment the host already confirmed", async () => {
    const { host, booking } = await setup("advance");
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
    });

    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_MARK_PAYMENT_NOT_REQUIRED",
    });

    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      paymentStatus: "NOT_REQUIRED",
      advancePaymentStatus: "PAYMENT_CONFIRMED",
    });
  });

  it("leaves the damage deposit alone when the price is waived", async () => {
    const { host, booking } = await setup("both");
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_MARK_PAYMENT_NOT_REQUIRED",
    });

    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      paymentStatus: "NOT_REQUIRED",
      advancePaymentStatus: "NOT_REQUIRED",
      // Security money, additional to the price and still expected back.
      damageDepositStatus: "AWAITING_DEPOSIT",
    });
  });

  it("refuses to waive a price the host already confirmed receiving", async () => {
    const { host, booking } = await setup("none");
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_PAYMENT_RECEIVED",
    });
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_MARK_PAYMENT_NOT_REQUIRED",
      }),
    ).rejects.toThrow("cannot be marked not required");
  });

  it("refuses a report on a track the host has waived", async () => {
    const { host, guest, booking } = await setup("advance");
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_MARK_PAYMENT_NOT_REQUIRED",
    });
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
      }),
    ).rejects.toThrow("marked as not required");
  });

  // ---- Repeats -----------------------------------------------------------------
  //
  // One rule for all three tracks: restating your own report is a no-op, repeating the
  // other side's settlement is refused. The advance track used to allow the first and
  // the damage track used to refuse it, for no reason either one could state.

  it("treats a repeated report as a no-op on both tracks alike", async () => {
    const { host, guest, booking } = await setup("both");

    for (const event of [
      "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
      "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
    ] as const) {
      const first = await recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event,
      });
      const second = await recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event,
      });
      expect(first.changed).toBe(true);
      expect(second.changed).toBe(false);
    }

    const progress = await getBookingPaymentProgress(booking.id, host.id);
    expect(progress).toMatchObject({
      advancePaymentStatus: "PAYMENT_REPORTED",
      damageDepositStatus: "DEPOSIT_REPORTED",
    });
    // Saying the same thing twice writes one row, not two.
    expect(progress?.paymentStatusEvents).toHaveLength(2);
  });

  it("refuses a repeated confirmation on both tracks alike", async () => {
    const { host, guest, booking } = await setup("both");
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
      event: "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
    });

    for (const event of [
      "HOST_CONFIRM_ADVANCE_PAYMENT_RECEIVED",
      "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED",
    ] as const) {
      await expect(
        recordBookingPaymentEvent({
          bookingId: booking.id,
          actorId: host.id,
          event,
        }),
      ).rejects.toThrow("already been confirmed");
    }
  });

  // ---- Transitions the machine will not make -----------------------------------

  it("refuses to confirm a return the host never reported", async () => {
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
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event: "GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED",
      }),
    ).rejects.toThrow("has not reported returning");
  });

  it("refuses to retain a deposit that has already gone back to the guest", async () => {
    const { host, guest, booking } = await setup("damage");
    for (const [actorId, event] of [
      [guest.id, "GUEST_REPORT_DAMAGE_DEPOSIT_SENT"],
      [host.id, "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED"],
      [host.id, "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED"],
      [guest.id, "GUEST_CONFIRM_DAMAGE_DEPOSIT_RETURNED"],
    ] as const) {
      await recordBookingPaymentEvent({ bookingId: booking.id, actorId, event });
    }

    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_MARK_DAMAGE_DEPOSIT_RETAINED",
      }),
    ).rejects.toThrow("already been returned");
  });

  it("refuses a deposit report once the host has confirmed receiving it", async () => {
    const { host, guest, booking } = await setup("damage");
    await recordBookingPaymentEvent({
      bookingId: booking.id,
      actorId: host.id,
      event: "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED",
    });
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event: "GUEST_REPORT_DAMAGE_DEPOSIT_SENT",
      }),
    ).rejects.toThrow("already been confirmed");
  });

  it("refuses every track event on a booking that froze no policy at all", async () => {
    const { host, guest, booking } = await setup("none");
    expect(await getBookingPaymentProgress(booking.id, host.id)).toMatchObject({
      advancePaymentStatus: "NOT_REQUIRED",
      damageDepositStatus: "NOT_REQUIRED",
    });
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event: "GUEST_REPORT_ADVANCE_PAYMENT_SENT",
      }),
    ).rejects.toThrow("does not require an advance payment");
    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: host.id,
        event: "HOST_REPORT_DAMAGE_DEPOSIT_RETURNED",
      }),
    ).rejects.toThrow("does not require a damage deposit");
  });

  it("freezes a zero-value advance policy as settled, not as money owed", async () => {
    // The policy object exists, so the track is "required" as far as the snapshot goes,
    // but nothing is actually owed. Requested state only — acceptance is booking.service's.
    const { host, booking } = await setup("advance", { advancePaymentValue: "0" }, false);
    const progress = await getBookingPaymentProgress(booking.id, host.id);
    expect(Number(progress?.advancePaymentAmount)).toBe(0);
    expect(progress?.advancePaymentStatus).toBe("NOT_REQUIRED");
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
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });
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
    await confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" });

    await expect(
      recordBookingPaymentEvent({
        bookingId: booking.id,
        actorId: guest.id,
        event: "GUEST_REPORT_DEPOSIT_SENT",
      }),
    ).rejects.toThrow("Reload the page");
  });
});

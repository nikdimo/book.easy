import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listingFindMany: vi.fn(),
  bookingFindMany: vi.fn(),
  expirePendingBookings: vi.fn(),
  completePastBookings: vi.fn(),
  getDisplayCurrency: vi.fn(),
  getExchangeRates: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listing: { findMany: mocks.listingFindMany },
    booking: { findMany: mocks.bookingFindMany },
  },
}));
vi.mock("@/lib/services/booking.service", () => ({
  expirePendingBookings: mocks.expirePendingBookings,
  completePastBookings: mocks.completePastBookings,
}));
vi.mock("@/lib/currency/server", () => ({ getDisplayCurrency: mocks.getDisplayCurrency }));
vi.mock("@/lib/currency/rates", () => ({ getExchangeRates: mocks.getExchangeRates }));

import { getHostReservations } from "../host-reservations.service";

describe("getHostReservations payment projection", () => {
  it("projects the frozen deposit and actor-labelled payment status history", async () => {
    mocks.listingFindMany.mockResolvedValue([
      {
        id: "listing-1",
        title: "Loft",
        checkInTime: "15:00",
        checkOutTime: "11:00",
        acceptedPaymentMethods: [],
        paymentInstructionTemplates: null,
        property: { city: "Ohrid" },
        images: [],
      },
    ]);
    mocks.bookingFindMany.mockResolvedValue([
      {
        id: "booking-1",
        reference: "BK-1",
        status: "CONFIRMED",
        listingId: "listing-1",
        checkIn: new Date("2026-09-10T00:00:00.000Z"),
        checkOut: new Date("2026-09-12T00:00:00.000Z"),
        numberOfNights: 2,
        guestCount: 2,
        currency: "EUR",
        nightlyRate: "100",
        cleaningFee: "25",
        serviceFee: "0",
        discountAmount: "0",
        totalPrice: "225",
        paymentStatus: "PAYMENT_REPORTED",
        advancePaymentStatus: "PAYMENT_CONFIRMED",
        damageDepositStatus: "DEPOSIT_CONFIRMED",
        advancePaymentAmount: "40",
        damageDepositAmount: "75",
        // A booking frozen under V1, to prove the projection still reads it.
        depositPolicySnapshot: {
          version: 1,
          status: "REVIEWED",
          policy: "FIXED",
          purpose: "DAMAGE_SECURITY",
          value: "75",
          currency: "EUR",
          dueTiming: "AFTER_ACCEPTANCE",
          dueDaysBeforeCheckIn: null,
          returnDaysAfterCheckout: 7,
        },
        guestNote: null,
        cancellationReason: null,
        createdAt: new Date("2026-08-01T09:00:00.000Z"),
        respondedAt: new Date("2026-08-01T10:00:00.000Z"),
        responseDueAt: new Date("2026-08-02T09:00:00.000Z"),
        guest: { id: "guest-1", name: "Ana", image: null },
        conversation: null,
        reviewInvitations: [],
        reviews: [],
        paymentStatusEvents: [
          {
            id: "event-guest",
            actorId: "guest-1",
            eventType: "GUEST_REPORT_PAYMENT_SENT",
            createdAt: new Date("2026-08-02T12:00:00.000Z"),
          },
          {
            id: "event-host",
            actorId: "host-1",
            eventType: "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED",
            createdAt: new Date("2026-08-02T13:00:00.000Z"),
          },
        ],
      },
    ]);
    mocks.getDisplayCurrency.mockResolvedValue("EUR");
    mocks.getExchangeRates.mockResolvedValue(null);

    const result = await getHostReservations("host-1", "en");

    expect(result.reservations[0]).toMatchObject({
      paymentStatus: "PAYMENT_REPORTED",
      advancePaymentStatus: "PAYMENT_CONFIRMED",
      damageDepositStatus: "DEPOSIT_CONFIRMED",
      advancePaymentAmount: 40,
      damageDepositAmount: 75,
      // The V1 snapshot is projected onto the damage-deposit slot, unchanged.
      depositPolicies: expect.objectContaining({
        version: 2,
        status: "REVIEWED",
        advancePayment: null,
        damageDeposit: expect.objectContaining({ value: "75", returnDaysAfterCheckout: 7 }),
      }),
      paymentStatusEvents: [
        expect.objectContaining({ actor: "GUEST", eventType: "GUEST_REPORT_PAYMENT_SENT" }),
        expect.objectContaining({ actor: "HOST", eventType: "HOST_CONFIRM_DAMAGE_DEPOSIT_RECEIVED" }),
      ],
    });
  });
});

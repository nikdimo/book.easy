import { describe, expect, it, vi } from "vitest";

/**
 * What the host reservations panel is handed about who is coming.
 *
 * Same fully-mocked shape as `host-reservations.service.test.ts`: this is a projection,
 * and the only thing worth pinning here is that the four counters survive it and that a
 * booking with none recorded is projected as null rather than as four zeroes.
 */

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

const LISTING = {
  id: "listing-1",
  title: "Loft",
  checkInTime: "15:00",
  checkOutTime: "11:00",
  acceptedPaymentMethods: [],
  paymentInstructionTemplates: null,
  property: { city: "Ohrid" },
  images: [],
};

function bookingRow(over: Record<string, unknown>) {
  return {
    id: "booking-1",
    reference: "BK-1",
    status: "CONFIRMED",
    listingId: "listing-1",
    checkIn: new Date("2026-09-10T00:00:00.000Z"),
    checkOut: new Date("2026-09-12T00:00:00.000Z"),
    numberOfNights: 2,
    guestCount: 2,
    adults: null,
    children: null,
    infants: null,
    pets: null,
    currency: "EUR",
    nightlyRate: "100",
    cleaningFee: "25",
    serviceFee: "0",
    discountAmount: "0",
    totalPrice: "225",
    paymentStatus: "UNTRACKED",
    advancePaymentStatus: "NOT_REQUIRED",
    damageDepositStatus: "NOT_REQUIRED",
    advancePaymentAmount: null,
    damageDepositAmount: null,
    depositPolicySnapshot: null,
    guestNote: null,
    cancellationReason: null,
    createdAt: new Date("2026-08-01T09:00:00.000Z"),
    respondedAt: null,
    responseDueAt: new Date("2026-08-02T09:00:00.000Z"),
    guest: { id: "guest-1", name: "Ana", image: null },
    conversation: null,
    reviewInvitations: [],
    reviews: [],
    paymentStatusEvents: [],
    ...over,
  };
}

async function project(over: Record<string, unknown>) {
  mocks.listingFindMany.mockResolvedValue([LISTING]);
  mocks.bookingFindMany.mockResolvedValue([bookingRow(over)]);
  mocks.getDisplayCurrency.mockResolvedValue("EUR");
  mocks.getExchangeRates.mockResolvedValue(null);
  const result = await getHostReservations("host-1", "en");
  return result.reservations[0];
}

describe("host reservations carry the party", () => {
  it("projects the four counters beside the capacity count", async () => {
    const reservation = await project({
      guestCount: 3,
      adults: 2,
      children: 1,
      infants: 1,
      pets: 1,
    });

    expect(reservation.guestCount).toBe(3);
    expect(reservation.party).toEqual({
      adults: 2,
      children: 1,
      infants: 1,
      pets: 1,
    });
  });

  it("projects a booking with no recorded party as null, not as zeroes", async () => {
    const reservation = await project({});

    expect(reservation.guestCount).toBe(2);
    expect(reservation.party).toBeNull();
  });

  it("selects the four columns so the projection has something to read", async () => {
    await project({});

    expect(mocks.bookingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          adults: true,
          children: true,
          infants: true,
          pets: true,
        }),
      }),
    );
  });
});

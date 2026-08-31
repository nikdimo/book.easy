import { describe, expect, it, vi } from "vitest";

/**
 * The price figures the host panel is handed.
 *
 * Audit L2: the panel used to compute its accommodation row as
 * `nightlyRate * nights`. That column is a rounded effective average, so on an uneven
 * stay the row it produced did not add up to the booking total printed two lines below
 * it. The service now resolves the figures once, from the frozen `priceBreakdown` when
 * there is one and from the stored totals when there is not, and the panel prints them.
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
vi.mock("@/lib/currency/server", () => ({
  getDisplayCurrency: mocks.getDisplayCurrency,
}));
vi.mock("@/lib/currency/rates", () => ({ getExchangeRates: mocks.getExchangeRates }));

import { getHostReservations } from "../host-reservations.service";

/** Prisma hands the money columns over as `Decimal`; strings stand in for them here,
 *  exactly as the sibling projection test does. */
function bookingRow(overrides: Record<string, unknown>) {
  return {
    id: "booking-1",
    reference: "BK-1",
    status: "CONFIRMED",
    listingId: "listing-1",
    checkIn: new Date("2026-09-10T00:00:00.000Z"),
    checkOut: new Date("2026-09-13T00:00:00.000Z"),
    numberOfNights: 3,
    guestCount: 2,
    currency: "EUR",
    serviceFee: "0",
    discountAmount: "0",
    paymentStatus: "UNTRACKED",
    advancePaymentStatus: "UNTRACKED",
    damageDepositStatus: "UNTRACKED",
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
    ...overrides,
  };
}

async function reserve(overrides: Record<string, unknown>) {
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
  mocks.bookingFindMany.mockResolvedValue([bookingRow(overrides)]);
  mocks.getDisplayCurrency.mockResolvedValue("EUR");
  mocks.getExchangeRates.mockResolvedValue(null);

  const result = await getHostReservations("host-1", "en");
  return result.reservations[0];
}

describe("getHostReservations pricing projection", () => {
  it("takes the accommodation subtotal from the frozen breakdown, not from the average", async () => {
    // 100 + 100 + 101. `nightlyRate` rounds to 100.33, and 100.33 * 3 is 300.99.
    const reservation = await reserve({
      nightlyRate: "100.33",
      cleaningFee: "25",
      totalPrice: "326",
      priceBreakdown: {
        version: 2,
        currency: "EUR",
        accommodationSubtotal: 301,
        cleaningFee: 25,
      },
    });

    expect(reservation.accommodationSubtotal).toBe(301);
    expect(reservation.originalAccommodationSubtotal).toBe(301);
    expect(reservation.averageNightlyRate).toBe(100.33);
    expect(reservation.nightlyRate * reservation.nights).not.toBe(
      reservation.accommodationSubtotal,
    );
    // The rows the panel prints: gross accommodation, gross cleaning, less the
    // discount, plus the service fee.
    expect(
      reservation.originalAccommodationSubtotal +
        reservation.originalCleaningFee -
        reservation.discountAmount +
        reservation.serviceFee,
    ).toBeCloseTo(reservation.total, 2);
  });

  it("hands the panel the gross pair when a promotion is itemised", async () => {
    const reservation = await reserve({
      nightlyRate: "90",
      cleaningFee: "0",
      discountAmount: "55",
      totalPrice: "270",
      priceBreakdown: {
        version: 2,
        currency: "EUR",
        accommodationSubtotal: 270,
        accommodationDiscount: 30,
        cleaningFee: 0,
        cleaningDiscount: 25,
      },
    });

    expect(reservation.accommodationSubtotal).toBe(270);
    expect(reservation.originalAccommodationSubtotal).toBe(300);
    expect(reservation.originalCleaningFee).toBe(25);
    expect(
      reservation.originalAccommodationSubtotal +
        reservation.originalCleaningFee -
        reservation.discountAmount,
    ).toBeCloseTo(reservation.total, 2);
  });

  it("keeps a service fee out of the nights", async () => {
    const reservation = await reserve({
      nightlyRate: "100",
      cleaningFee: "25",
      serviceFee: "30",
      totalPrice: "355",
      priceBreakdown: {
        version: 2,
        currency: "EUR",
        accommodationSubtotal: 300,
        cleaningFee: 25,
      },
    });

    expect(reservation.accommodationSubtotal).toBe(300);
    expect(reservation.serviceFee).toBe(30);
    expect(
      reservation.accommodationSubtotal +
        reservation.cleaningFee +
        reservation.serviceFee,
    ).toBeCloseTo(reservation.total, 2);
  });

  it("derives the subtotal for a legacy booking with no breakdown", async () => {
    const reservation = await reserve({
      nightlyRate: "100.33",
      cleaningFee: "25",
      totalPrice: "326",
      priceBreakdown: null,
    });

    expect(reservation.accommodationSubtotal).toBe(301);
    expect(reservation.averageNightlyRate).toBe(100.33);
    expect(
      reservation.accommodationSubtotal +
        reservation.cleaningFee +
        reservation.serviceFee,
    ).toBeCloseTo(reservation.total, 2);
  });

  it("zero fees stay zero", async () => {
    const reservation = await reserve({
      nightlyRate: "100",
      cleaningFee: "0",
      totalPrice: "300",
      priceBreakdown: null,
    });

    expect(reservation.cleaningFee).toBe(0);
    expect(reservation.originalCleaningFee).toBe(0);
    expect(reservation.accommodationSubtotal).toBe(300);
  });

  it("carries the booking's own currency", async () => {
    const reservation = await reserve({
      currency: "MKD",
      nightlyRate: "6000",
      cleaningFee: "1500",
      totalPrice: "19500",
      priceBreakdown: null,
    });

    expect(reservation.currency).toBe("MKD");
    expect(reservation.accommodationSubtotal).toBe(18000);
  });

  it("projects one internally consistent resolved set instead of mixing raw columns", async () => {
    const reservation = await reserve({
      nightlyRate: "100.33",
      cleaningFee: "20",
      discountAmount: "999",
      totalPrice: "326",
      priceBreakdown: {
        version: 2,
        currency: "EUR",
        accommodationSubtotal: 301,
        accommodationDiscount: 30,
        cleaningFee: 25,
        cleaningDiscount: 5,
      },
    });

    expect(reservation.accommodationSubtotal).toBe(301);
    expect(reservation.cleaningFee).toBe(25);
    expect(reservation.discountAmount).toBe(35);
    expect(
      reservation.originalAccommodationSubtotal +
        reservation.originalCleaningFee -
        reservation.discountAmount +
        reservation.serviceFee,
    ).toBe(reservation.total);
  });
});

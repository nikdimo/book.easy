import { describe, expect, it } from "vitest";
import { resolveBookingPricing } from "@/lib/booking-pricing";

/**
 * Audit L2. `Booking.nightlyRate` is a rounded effective average, so
 * `nightlyRate * nights` is not the accommodation subtotal — and the receipts that
 * multiplied it printed lines that did not add up to the total beneath them.
 *
 * The invariant every case here checks is the same one: whichever pair of figures a
 * surface prints, they reconcile with `totalPrice` exactly.
 *
 *   net:   accommodationSubtotal + cleaningFee + serviceFee            === totalPrice
 *   gross: originalAccommodation + originalCleaning - discount + fee   === totalPrice
 */

/** The shape `createBooking` freezes, with only the fields readers touch. */
function breakdown(fields: Record<string, number>) {
  return {
    version: 2,
    currency: "EUR",
    nights: [],
    accommodationDiscount: 0,
    cleaningDiscount: 0,
    ...fields,
  };
}

function expectReconciles(
  pricing: ReturnType<typeof resolveBookingPricing>,
): void {
  const net =
    pricing.accommodationSubtotal + pricing.cleaningFee + pricing.serviceFee;
  expect(net).toBeCloseTo(pricing.totalPrice, 2);
  const gross =
    pricing.originalAccommodationSubtotal +
    pricing.originalCleaningFee -
    pricing.discountAmount +
    pricing.serviceFee;
  expect(gross).toBeCloseTo(pricing.totalPrice, 2);
}

describe("resolveBookingPricing", () => {
  it("uses the frozen subtotal for an uneven stay the average cannot reconstruct", () => {
    // 100 + 100 + 101. The stored average is 100.33 and 100.33 * 3 is 300.99 — a cent
    // short of the accommodation, and the exact defect L2 describes.
    const pricing = resolveBookingPricing({
      currency: "EUR",
      totalPrice: 301,
      cleaningFee: 0,
      serviceFee: 0,
      discountAmount: 0,
      numberOfNights: 3,
      nightlyRate: 100.33,
      priceBreakdown: breakdown({
        accommodationSubtotal: 301,
        cleaningFee: 0,
        originalAccommodationSubtotal: 301,
      }),
    });

    expect(pricing.source).toBe("BREAKDOWN");
    expect(pricing.accommodationSubtotal).toBe(301);
    expect(pricing.averageNightlyRate).toBe(100.33);
    expect(pricing.averageNightlyRate * pricing.nights).not.toBe(
      pricing.accommodationSubtotal,
    );
    expectReconciles(pricing);
  });

  it("keeps the cleaning and service fees out of the accommodation subtotal", () => {
    const pricing = resolveBookingPricing({
      currency: "EUR",
      totalPrice: 355,
      cleaningFee: 25,
      serviceFee: 30,
      discountAmount: 0,
      numberOfNights: 3,
      nightlyRate: 100,
      priceBreakdown: breakdown({
        accommodationSubtotal: 300,
        cleaningFee: 25,
      }),
    });

    expect(pricing.accommodationSubtotal).toBe(300);
    expect(pricing.cleaningFee).toBe(25);
    expect(pricing.serviceFee).toBe(30);
    expect(pricing.averageNightlyRate).toBe(100);
    expectReconciles(pricing);
  });

  it("reads zero fees as zero rather than as absent", () => {
    const pricing = resolveBookingPricing({
      currency: "EUR",
      totalPrice: 300,
      cleaningFee: 0,
      serviceFee: 0,
      discountAmount: 0,
      numberOfNights: 3,
      nightlyRate: 100,
      priceBreakdown: breakdown({ accommodationSubtotal: 300, cleaningFee: 0 }),
    });

    expect(pricing.cleaningFee).toBe(0);
    expect(pricing.serviceFee).toBe(0);
    expect(pricing.originalCleaningFee).toBe(0);
    expect(pricing.accommodationSubtotal).toBe(300);
    expectReconciles(pricing);
  });

  it("splits a promotion into the gross pair a discount row can sit beside", () => {
    // 300 of nights discounted by 30, plus a cleaning fee waived entirely.
    const pricing = resolveBookingPricing({
      currency: "EUR",
      totalPrice: 270,
      cleaningFee: 0,
      serviceFee: 0,
      discountAmount: 55,
      numberOfNights: 3,
      nightlyRate: 90,
      priceBreakdown: breakdown({
        accommodationSubtotal: 270,
        accommodationDiscount: 30,
        originalAccommodationSubtotal: 300,
        cleaningFee: 0,
        cleaningDiscount: 25,
        originalCleaningFee: 25,
      }),
    });

    expect(pricing.source).toBe("BREAKDOWN");
    expect(pricing.accommodationSubtotal).toBe(270);
    expect(pricing.originalAccommodationSubtotal).toBe(300);
    expect(pricing.originalCleaningFee).toBe(25);
    expect(pricing.discountAmount).toBe(55);
    expect(pricing.averageNightlyRate).toBe(90);
    expectReconciles(pricing);
  });

  it("never lets the net figures and a discount row subtract the promotion twice", () => {
    const pricing = resolveBookingPricing({
      currency: "EUR",
      totalPrice: 270,
      cleaningFee: 0,
      serviceFee: 0,
      discountAmount: 30,
      numberOfNights: 3,
      nightlyRate: 90,
      priceBreakdown: breakdown({
        accommodationSubtotal: 270,
        accommodationDiscount: 30,
        cleaningFee: 0,
      }),
    });

    // The arrangement the pages used to print: net accommodation beside a discount line.
    const wrong =
      pricing.accommodationSubtotal +
      pricing.cleaningFee -
      pricing.discountAmount;
    expect(wrong).not.toBe(pricing.totalPrice);
    // The arrangement they print now.
    expectReconciles(pricing);
  });

  describe("legacy bookings", () => {
    it("derives the subtotal from the stored totals when there is no breakdown", () => {
      const pricing = resolveBookingPricing({
        currency: "EUR",
        totalPrice: 326,
        cleaningFee: 25,
        serviceFee: 0,
        discountAmount: 0,
        numberOfNights: 3,
        nightlyRate: 100.33,
        priceBreakdown: null,
      });

      expect(pricing.source).toBe("DERIVED");
      // 301, not the 300.99 the average would have produced.
      expect(pricing.accommodationSubtotal).toBe(301);
      expect(pricing.averageNightlyRate).toBe(100.33);
      expectReconciles(pricing);
    });

    it("attributes a legacy discount to the nights so the gross pair still reconciles", () => {
      const pricing = resolveBookingPricing({
        currency: "EUR",
        totalPrice: 270,
        cleaningFee: 0,
        serviceFee: 0,
        discountAmount: 30,
        numberOfNights: 3,
        nightlyRate: 90,
        priceBreakdown: null,
      });

      expect(pricing.source).toBe("DERIVED");
      expect(pricing.accommodationSubtotal).toBe(270);
      expect(pricing.originalAccommodationSubtotal).toBe(300);
      expect(pricing.originalCleaningFee).toBe(0);
      expectReconciles(pricing);
    });

    it("falls back when the breakdown does not reconcile with its own total", () => {
      // A breakdown describing a different booking than the total column does. The
      // total column wins, because it is the amount the guest owes.
      const pricing = resolveBookingPricing({
        currency: "EUR",
        totalPrice: 400,
        cleaningFee: 25,
        serviceFee: 0,
        discountAmount: 0,
        numberOfNights: 3,
        nightlyRate: 125,
        priceBreakdown: breakdown({
          accommodationSubtotal: 300,
          cleaningFee: 25,
        }),
      });

      expect(pricing.source).toBe("DERIVED");
      expect(pricing.accommodationSubtotal).toBe(375);
      expectReconciles(pricing);
    });

    it("treats a breakdown that is not an object as no breakdown", () => {
      for (const value of ["not json", [1, 2], 42, undefined]) {
        const pricing = resolveBookingPricing({
          currency: "EUR",
          totalPrice: 200,
          cleaningFee: 20,
          serviceFee: 0,
          numberOfNights: 2,
          priceBreakdown: value,
        });
        expect(pricing.source).toBe("DERIVED");
        expect(pricing.accommodationSubtotal).toBe(180);
        expectReconciles(pricing);
      }
    });

    it("reads a breakdown stored as a JSON string", () => {
      const pricing = resolveBookingPricing({
        currency: "EUR",
        totalPrice: 325,
        cleaningFee: 25,
        serviceFee: 0,
        numberOfNights: 3,
        priceBreakdown: JSON.stringify(
          breakdown({ accommodationSubtotal: 300, cleaningFee: 25 }),
        ),
      });

      expect(pricing.source).toBe("BREAKDOWN");
      expect(pricing.accommodationSubtotal).toBe(300);
      expectReconciles(pricing);
    });

    it("never derives a negative subtotal from fees larger than the total", () => {
      const pricing = resolveBookingPricing({
        currency: "EUR",
        totalPrice: 10,
        cleaningFee: 25,
        serviceFee: 0,
        numberOfNights: 1,
        priceBreakdown: null,
      });

      expect(pricing.accommodationSubtotal).toBe(0);
      expect(pricing.averageNightlyRate).toBe(0);
      expect(pricing.cleaningFee).toBe(10);
      expectReconciles(pricing);
    });

    it("rejects a breakdown that is one cent out instead of printing that mismatch", () => {
      const pricing = resolveBookingPricing({
        currency: "EUR",
        totalPrice: 326,
        cleaningFee: 25,
        serviceFee: 0,
        numberOfNights: 3,
        priceBreakdown: breakdown({
          accommodationSubtotal: 300.99,
          cleaningFee: 25,
        }),
      });

      expect(pricing.source).toBe("DERIVED");
      expect(pricing.accommodationSubtotal).toBe(301);
      expectReconciles(pricing);
    });
  });

  it("coerces Decimal-like money columns without losing cents", () => {
    // Prisma hands these over as `Decimal`, which stringifies to a plain decimal.
    const decimal = (value: string) => ({ toString: () => value });
    const pricing = resolveBookingPricing({
      currency: "MKD",
      totalPrice: decimal("18507.50"),
      cleaningFee: decimal("1500.00"),
      serviceFee: decimal("0"),
      discountAmount: decimal("0"),
      numberOfNights: 3,
      nightlyRate: decimal("5669.17"),
      priceBreakdown: null,
    });

    expect(pricing.totalPrice).toBe(18507.5);
    expect(pricing.accommodationSubtotal).toBe(17007.5);
    expect(pricing.averageNightlyRate).toBe(5669.17);
    expectReconciles(pricing);
  });

  it("carries the booking's own currency through untouched", () => {
    for (const currency of ["EUR", "MKD", "USD"]) {
      expect(
        resolveBookingPricing({
          currency,
          totalPrice: 100,
          cleaningFee: 0,
          numberOfNights: 1,
          priceBreakdown: null,
        }).currency,
      ).toBe(currency);
    }
  });

  it("reports a zero average rather than dividing by zero nights", () => {
    const pricing = resolveBookingPricing({
      currency: "EUR",
      totalPrice: 50,
      cleaningFee: 50,
      numberOfNights: 0,
      priceBreakdown: null,
    });

    expect(pricing.nights).toBe(0);
    expect(pricing.averageNightlyRate).toBe(0);
    expect(pricing.accommodationSubtotal).toBe(0);
  });
});

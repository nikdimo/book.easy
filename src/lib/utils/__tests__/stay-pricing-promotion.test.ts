import { describe, expect, it } from "vitest";
import { computeStayQuote } from "@/lib/utils/stay-pricing";

const checkIn = new Date(2030, 5, 1);
const checkOut = new Date(2030, 5, 4);

describe("computeStayQuote promotions", () => {
  it("applies a percentage after date-specific nightly rates", () => {
    const quote = computeStayQuote({
      baseNightly: 100,
      cleaningFee: 50,
      checkIn,
      checkOut,
      overrides: new Map([["2030-06-02", 120]]),
      promotion: {
        type: "PERCENT_DISCOUNT",
        discountPercent: 10,
        minimumNights: 3,
      },
    });

    expect(quote.originalAccommodationSubtotal).toBe(320);
    expect(quote.accommodationDiscount).toBe(32);
    expect(quote.cleaningFee).toBe(50);
    expect(quote.originalTotal).toBe(370);
    expect(quote.total).toBe(338);
    expect(quote.promotionEligible).toBe(true);
  });

  it("keeps shorter stays bookable at the normal price", () => {
    const quote = computeStayQuote({
      baseNightly: 100,
      cleaningFee: 50,
      checkIn,
      checkOut,
      overrides: new Map(),
      promotion: {
        type: "PERCENT_DISCOUNT",
        discountPercent: 20,
        minimumNights: 7,
      },
    });

    expect(quote.promotionEligible).toBe(false);
    expect(quote.discountAmount).toBe(0);
    expect(quote.total).toBe(350);
  });

  it("removes exactly the cleaning fee for an eligible free-cleaning offer", () => {
    const quote = computeStayQuote({
      baseNightly: 80,
      cleaningFee: 37.45,
      checkIn,
      checkOut,
      overrides: new Map(),
      promotion: {
        type: "FREE_CLEANING",
        minimumNights: null,
      },
    });

    expect(quote.accommodationSubtotal).toBe(240);
    expect(quote.cleaningDiscount).toBe(37.45);
    expect(quote.cleaningFee).toBe(0);
    expect(quote.total).toBe(240);
  });

  it("rounds a percentage discount once to the nearest cent", () => {
    const quote = computeStayQuote({
      baseNightly: 99.99,
      cleaningFee: 0,
      checkIn,
      checkOut,
      overrides: new Map(),
      promotion: {
        type: "PERCENT_DISCOUNT",
        discountPercent: 17,
      },
    });

    expect(quote.originalAccommodationSubtotal).toBe(299.97);
    expect(quote.accommodationDiscount).toBe(50.99);
    expect(quote.total).toBe(248.98);
  });

  it("uses the highest qualifying minimum-stay threshold", () => {
    const quote = computeStayQuote({
      baseNightly: 100,
      cleaningFee: 40,
      checkIn: new Date(2030, 5, 1),
      checkOut: new Date(2030, 5, 12),
      overrides: new Map(),
      promotions: [
        {
          id: "five-nights",
          type: "PERCENT_DISCOUNT",
          discountPercent: 10,
          minimumNights: 5,
        },
        {
          id: "ten-nights",
          type: "PERCENT_DISCOUNT",
          discountPercent: 15,
          minimumNights: 10,
          freeCleaning: true,
        },
      ],
    });

    expect(quote.appliedPromotion?.id).toBe("ten-nights");
    expect(quote.accommodationDiscount).toBe(165);
    expect(quote.cleaningDiscount).toBe(40);
    expect(quote.total).toBe(935);
  });

  it("prefers a date-specific promotion over an always-active promotion", () => {
    const quote = computeStayQuote({
      baseNightly: 100,
      cleaningFee: 0,
      checkIn,
      checkOut,
      overrides: new Map(),
      promotions: [
        {
          id: "always",
          type: "PERCENT_DISCOUNT",
          discountPercent: 20,
          minimumNights: 1,
        },
        {
          id: "summer",
          type: "PERCENT_DISCOUNT",
          discountPercent: 10,
          minimumNights: 1,
          startDate: new Date(2030, 5, 1),
          endDate: new Date(2030, 6, 1),
        },
      ],
    });

    expect(quote.appliedPromotion?.id).toBe("summer");
    expect(quote.total).toBe(270);
  });

  it("does not use a dated promotion unless the whole stay fits its scope", () => {
    const quote = computeStayQuote({
      baseNightly: 100,
      cleaningFee: 0,
      checkIn,
      checkOut,
      overrides: new Map(),
      promotions: [
        {
          id: "always",
          type: "PERCENT_DISCOUNT",
          discountPercent: 10,
          minimumNights: 1,
        },
        {
          id: "partial",
          type: "PERCENT_DISCOUNT",
          discountPercent: 30,
          minimumNights: 1,
          startDate: new Date(2030, 5, 2),
          endDate: new Date(2030, 5, 10),
        },
      ],
    });

    expect(quote.appliedPromotion?.id).toBe("always");
    expect(quote.total).toBe(270);
  });

  it("supports free cleaning as the only benefit", () => {
    const quote = computeStayQuote({
      baseNightly: 100,
      cleaningFee: 45,
      checkIn,
      checkOut,
      overrides: new Map(),
      promotions: [
        {
          id: "cleaning-only",
          type: "FREE_CLEANING",
          discountPercent: 0,
          freeCleaning: true,
          minimumNights: 3,
        },
      ],
    });

    expect(quote.appliedPromotion?.id).toBe("cleaning-only");
    expect(quote.accommodationDiscount).toBe(0);
    expect(quote.cleaningDiscount).toBe(45);
    expect(quote.total).toBe(300);
  });

  it("rounds every discounted night upward to the nearest five euros", () => {
    const quote = computeStayQuote({
      baseNightly: 99,
      cleaningFee: 0,
      checkIn,
      checkOut,
      overrides: new Map([["2030-06-02", 121]]),
      promotions: [
        {
          id: "rounded",
          type: "PERCENT_DISCOUNT",
          discountPercent: 10,
          minimumNights: 1,
          roundUpToNearestFive: true,
        },
      ],
    });

    // €99 -> €90, €121 -> €110, €99 -> €90.
    expect(quote.originalAccommodationSubtotal).toBe(319);
    expect(quote.accommodationSubtotal).toBe(290);
    expect(quote.total).toBe(290);
  });
});

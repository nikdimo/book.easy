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
});

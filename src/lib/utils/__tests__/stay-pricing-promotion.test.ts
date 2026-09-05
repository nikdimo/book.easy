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
        // As a stored row actually holds it. The `type` is the offer's label; the
        // benefit is the `freeCleaning` column, and only the column decides (#8).
        type: "FREE_CLEANING",
        freeCleaning: true,
        minimumNights: null,
      },
    });

    expect(quote.accommodationSubtotal).toBe(240);
    expect(quote.cleaningDiscount).toBe(37.45);
    expect(quote.cleaningFee).toBe(0);
    expect(quote.total).toBe(240);
  });

  /**
   * #8: the benefit is the column, not the label.
   *
   * Clearing a listing's cleaning fee clears `freeCleaning` on its active offers. While
   * the reader OR-ed the `type` back in, an offer created as free-cleaning-only kept
   * winning nights after that write and kept stamping `promotionId` onto bookings
   * against a discount of zero.
   */
  it("gives nothing away once the free-cleaning benefit is cleared", () => {
    const quote = computeStayQuote({
      baseNightly: 80,
      cleaningFee: 37.45,
      checkIn,
      checkOut,
      overrides: new Map(),
      promotions: [
        {
          id: "cleared",
          type: "FREE_CLEANING",
          discountPercent: 0,
          freeCleaning: false,
          minimumNights: null,
        },
      ],
    });

    expect(quote.cleaningDiscount).toBe(0);
    expect(quote.cleaningFee).toBe(37.45);
    expect(quote.promotionEligible).toBe(false);
    expect(quote.appliedPromotion).toBeNull();
  });

  it("rounds each discounted night to the nearest cent", () => {
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
    expect(quote.accommodationDiscount).toBe(51);
    expect(quote.total).toBe(248.97);
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

  it("uses the higher discount instead of automatically preferring a dated offer", () => {
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

    expect(quote.appliedPromotion?.id).toBe("always");
    expect(quote.total).toBe(240);
  });

  it("can use different promotions on different nights of one stay", () => {
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

    expect(quote.appliedPromotion?.id).toBe("partial");
    expect(quote.appliedPromotions.map((promotion) => promotion.id)).toEqual([
      "always",
      "partial",
    ]);
    expect(quote.nightlyBreakdown.map((night) => night.promotionId)).toEqual([
      "always",
      "partial",
      "partial",
    ]);
    expect(quote.total).toBe(230);
  });

  it("uses the higher overlapping promotion only on the nights it covers", () => {
    const quote = computeStayQuote({
      baseNightly: 100,
      cleaningFee: 0,
      checkIn: new Date(2030, 7, 3),
      checkOut: new Date(2030, 7, 13),
      overrides: new Map(),
      promotions: [
        {
          id: "early-august",
          type: "PERCENT_DISCOUNT",
          discountPercent: 10,
          minimumNights: 1,
          startDate: new Date(2030, 7, 1),
          endDate: new Date(2030, 7, 11),
        },
        {
          id: "mid-august",
          type: "PERCENT_DISCOUNT",
          discountPercent: 20,
          minimumNights: 1,
          startDate: new Date(2030, 7, 5),
          endDate: new Date(2030, 7, 16),
        },
      ],
    });

    expect(quote.nightlyBreakdown.map((night) => night.promotionId)).toEqual([
      "early-august",
      "early-august",
      "mid-august",
      "mid-august",
      "mid-august",
      "mid-august",
      "mid-august",
      "mid-august",
      "mid-august",
      "mid-august",
    ]);
    expect(quote.accommodationDiscount).toBe(180);
    expect(quote.total).toBe(820);
  });

  it("chooses free cleaning when it saves more overall without stacking a night", () => {
    const quote = computeStayQuote({
      baseNightly: 100,
      cleaningFee: 100,
      checkIn: new Date(2030, 7, 1),
      checkOut: new Date(2030, 7, 3),
      overrides: new Map(),
      promotions: [
        {
          id: "twenty-percent",
          type: "PERCENT_DISCOUNT",
          discountPercent: 20,
          minimumNights: 1,
        },
        {
          id: "cleaning",
          type: "PERCENT_DISCOUNT",
          discountPercent: 5,
          minimumNights: 1,
          freeCleaning: true,
        },
      ],
    });

    expect(quote.nightlyBreakdown.map((night) => night.promotionId)).toEqual([
      "cleaning",
      "twenty-percent",
    ]);
    expect(quote.accommodationDiscount).toBe(25);
    expect(quote.cleaningDiscount).toBe(100);
    expect(quote.total).toBe(175);
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

  it("rounds every discounted night to the nearest whole unit", () => {
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
          roundToWholeUnit: true,
        },
      ],
    });

    // 89.10 -> 89 (down), 108.90 -> 109 (up), 89.10 -> 89 (down).
    expect(quote.originalAccommodationSubtotal).toBe(319);
    expect(quote.accommodationSubtotal).toBe(287);
    expect(quote.total).toBe(287);
  });

  function roundedNightly(baseNightly: number, discountPercent: number) {
    const quote = computeStayQuote({
      baseNightly,
      cleaningFee: 0,
      checkIn,
      checkOut: new Date(2030, 5, 2),
      overrides: new Map(),
      promotions: [
        {
          id: "rounded",
          type: "PERCENT_DISCOUNT",
          discountPercent,
          minimumNights: 1,
          roundToWholeUnit: true,
        },
      ],
    });
    return quote.accommodationSubtotal;
  }

  it("rounds a decimal part below .50 down", () => {
    // 27.40
    expect(roundedNightly(68.5, 60)).toBe(27);
  });

  it("rounds a decimal part of exactly .50 up", () => {
    // 27.50
    expect(roundedNightly(55, 50)).toBe(28);
  });

  it("rounds a decimal part above .50 up", () => {
    // 27.90 — the €31 at 10% off case from the spec.
    expect(roundedNightly(31, 10)).toBe(28);
  });

  it("leaves an already whole discounted price untouched", () => {
    // 27.00
    expect(roundedNightly(30, 10)).toBe(27);
  });

  it("keeps the exact cent amount when rounding is disabled", () => {
    const quote = computeStayQuote({
      baseNightly: 31,
      cleaningFee: 0,
      checkIn,
      checkOut: new Date(2030, 5, 2),
      overrides: new Map(),
      promotions: [
        {
          id: "exact",
          type: "PERCENT_DISCOUNT",
          discountPercent: 10,
          minimumNights: 1,
          roundToWholeUnit: false,
        },
      ],
    });

    expect(quote.accommodationSubtotal).toBe(27.9);
    expect(quote.accommodationDiscount).toBe(3.1);
  });

  it("never rounds a discounted night above the original nightly price", () => {
    // 9.60 would round to 10, which is more than the €9.80 rate.
    const quote = computeStayQuote({
      baseNightly: 9.8,
      cleaningFee: 0,
      checkIn,
      checkOut: new Date(2030, 5, 2),
      overrides: new Map(),
      promotions: [
        {
          id: "capped",
          type: "PERCENT_DISCOUNT",
          discountPercent: 2,
          minimumNights: 1,
          roundToWholeUnit: true,
        },
      ],
    });

    expect(quote.accommodationSubtotal).toBe(9.8);
    expect(quote.accommodationDiscount).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  promotionPhase,
  summarizePricing,
  type PricingSummaryPromotionInput,
} from "@/lib/host/v2/pricing-summary";

const TODAY = "2026-06-15";

function promotion(
  overrides: Partial<PricingSummaryPromotionInput> & { id: string },
): PricingSummaryPromotionInput {
  return {
    type: "PERCENT_DISCOUNT",
    discountPercent: 10,
    minimumNights: null,
    freeCleaning: false,
    startDate: null,
    endDate: null,
    ...overrides,
  };
}

describe("promotionPhase", () => {
  it("treats an offer with no dates as running now", () => {
    expect(promotionPhase({ startDate: null, endDate: null }, TODAY)).toBe("ACTIVE");
  });

  it("counts the first day as running and the exclusive end as finished", () => {
    expect(
      promotionPhase({ startDate: TODAY, endDate: "2026-07-01" }, TODAY),
    ).toBe("ACTIVE");
    expect(
      promotionPhase({ startDate: "2026-01-01", endDate: TODAY }, TODAY),
    ).toBe("PAST");
  });

  it("separates what has not started from what has finished", () => {
    expect(
      promotionPhase({ startDate: "2026-07-01", endDate: "2026-07-31" }, TODAY),
    ).toBe("UPCOMING");
    expect(
      promotionPhase({ startDate: "2026-01-01", endDate: "2026-01-31" }, TODAY),
    ).toBe("PAST");
  });
});

describe("summarizePricing", () => {
  it("drops finished offers and counts what is left by phase", () => {
    const summary = summarizePricing(
      {
        listingId: "listing-1",
        rule: {
          currency: "EUR",
          baseNightlyRate: 120,
          cleaningFee: 25,
          minNights: 2,
          maxNights: 30,
        },
        promotions: [
          promotion({ id: "past", startDate: "2026-01-01", endDate: "2026-02-01" }),
          promotion({ id: "later", startDate: "2026-09-01", endDate: "2026-09-30" }),
          promotion({ id: "soon", startDate: "2026-07-01", endDate: "2026-07-31" }),
          promotion({ id: "standing" }),
        ],
        datePriceDates: [],
      },
      TODAY,
    );

    expect(summary.promotions.map((p) => p.id)).toEqual(["standing", "soon", "later"]);
    expect(summary.activePromotionCount).toBe(1);
    expect(summary.upcomingPromotionCount).toBe(2);
  });

  it("reports the span of date-specific prices", () => {
    const summary = summarizePricing(
      {
        listingId: "listing-1",
        rule: null,
        promotions: [],
        datePriceDates: ["2026-08-02", "2026-06-20", "2026-07-11"],
      },
      TODAY,
    );

    expect(summary.datePriceCount).toBe(3);
    expect(summary.datePriceRange).toEqual({ from: "2026-06-20", to: "2026-08-02" });
  });

  it("survives a listing that has no pricing rule yet", () => {
    const summary = summarizePricing(
      { listingId: "listing-1", rule: null, promotions: [], datePriceDates: [] },
      TODAY,
    );

    expect(summary.rule).toBeNull();
    expect(summary.datePriceRange).toBeNull();
    expect(summary.promotions).toEqual([]);
    expect(summary.activePromotionCount).toBe(0);
    expect(summary.upcomingPromotionCount).toBe(0);
  });
});

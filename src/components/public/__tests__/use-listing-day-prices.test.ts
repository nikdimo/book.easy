import { describe, expect, it } from "vitest";
import { boundedCalendarPromotions } from "@/components/public/use-listing-day-prices";
import type { StayPromotion } from "@/lib/utils/stay-pricing";

describe("boundedCalendarPromotions", () => {
  it("keeps only promotions with a concrete, forward date window", () => {
    const bounded: StayPromotion = {
      id: "bounded",
      type: "PERCENT_DISCOUNT",
      discountPercent: 15,
      startDate: "2030-06-01",
      endDate: "2030-06-08",
    };
    const promotions: StayPromotion[] = [
      bounded,
      {
        id: "length-only",
        type: "PERCENT_DISCOUNT",
        discountPercent: 23,
        minimumNights: 8,
      },
      {
        id: "open-ended",
        type: "PERCENT_DISCOUNT",
        discountPercent: 10,
        startDate: "2030-06-01",
      },
      {
        id: "invalid",
        type: "PERCENT_DISCOUNT",
        discountPercent: 10,
        startDate: "not-a-date",
        endDate: "2030-06-08",
      },
      {
        id: "backwards",
        type: "PERCENT_DISCOUNT",
        discountPercent: 10,
        startDate: "2030-06-08",
        endDate: "2030-06-01",
      },
    ];

    expect(boundedCalendarPromotions(promotions)).toEqual([bounded]);
  });

  it("preserves an absent promotions value", () => {
    expect(boundedCalendarPromotions(undefined)).toBeUndefined();
  });
});

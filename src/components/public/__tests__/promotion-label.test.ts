import { describe, expect, it } from "vitest";
import { listablePromotions } from "@/components/public/promotion-label";
import type { StayPromotion } from "@/lib/utils/stay-pricing";

const today = new Date(2030, 5, 15);

const percentOffer: StayPromotion = {
  id: "percent",
  type: "PERCENT_DISCOUNT",
  discountPercent: 20,
  minimumNights: 7,
};
const cleaningOffer: StayPromotion = {
  id: "cleaning",
  type: "FREE_CLEANING",
  freeCleaning: true,
  minimumNights: 3,
};

describe("listablePromotions", () => {
  it("lists the easiest stay to qualify for first", () => {
    expect(
      listablePromotions([percentOffer, cleaningOffer], today).map((p) => p.id),
    ).toEqual(["cleaning", "percent"]);
  });

  it("drops an offer that has already ended", () => {
    const expired: StayPromotion = {
      ...percentOffer,
      id: "expired",
      startDate: new Date(2030, 0, 1),
      endDate: new Date(2030, 4, 1),
    };

    expect(listablePromotions([expired, cleaningOffer], today).map((p) => p.id))
      .toEqual(["cleaning"]);
  });

  it("keeps an offer whose window is still open", () => {
    const running: StayPromotion = {
      ...percentOffer,
      id: "running",
      startDate: new Date(2030, 5, 1),
      endDate: new Date(2030, 8, 1),
    };

    expect(listablePromotions([running], today).map((p) => p.id)).toEqual([
      "running",
    ]);
  });

  it("drops an offer that gives nothing away", () => {
    const empty: StayPromotion = {
      id: "empty",
      type: "PERCENT_DISCOUNT",
      discountPercent: 0,
    };

    expect(listablePromotions([empty], today)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/currency/convert";
import {
  computeCalendarPromotionPreview,
  computeEvergreenPromotionBaseExample,
} from "@/lib/host/calendar-promotion-preview";

const baseInput = {
  baseNightlyRate: 100,
  cleaningFee: 30,
  startDate: "2030-06-01",
  endDate: "2030-06-04",
  datePrices: [],
  promotions: [],
  proposal: {
    discountPercent: 20,
    minimumNights: 1,
    freeCleaning: false,
    roundToWholeUnit: false,
  },
};

describe("calendar promotion preview", () => {
  it("discounts the effective selected-date override instead of the base rate", () => {
    const { quote } = computeCalendarPromotionPreview({
      ...baseInput,
      startDate: "2030-06-01",
      endDate: "2030-06-02",
      datePrices: [{ date: "2030-06-01", nightlyRate: 200 }],
    });

    expect(quote.originalAccommodationSubtotal).toBe(200);
    expect(quote.accommodationSubtotal).toBe(160);
    expect(quote.effectiveAverageNightly).toBe(160);
  });

  it("quotes mixed base and override nights with a truthful average and total", () => {
    const { quote } = computeCalendarPromotionPreview({
      ...baseInput,
      datePrices: [{ date: "2030-06-02", nightlyRate: 200 }],
    });

    expect(quote.originalAccommodationSubtotal).toBe(400);
    expect(quote.accommodationSubtotal).toBe(320);
    expect(quote.effectiveAverageNightly).toBeCloseTo(106.67, 2);
    expect(quote.total).toBe(350);
  });

  it("uses canonical per-night whole-unit rounding for mixed overrides", () => {
    const { quote } = computeCalendarPromotionPreview({
      ...baseInput,
      baseNightlyRate: 99,
      cleaningFee: 0,
      datePrices: [{ date: "2030-06-02", nightlyRate: 121 }],
      proposal: { ...baseInput.proposal, discountPercent: 10, roundToWholeUnit: true },
    });

    expect(quote.originalAccommodationSubtotal).toBe(319);
    expect(quote.accommodationSubtotal).toBe(287);
    expect(quote.total).toBe(287);
  });

  it("keeps exact cents when whole-unit rounding is off", () => {
    const { quote } = computeCalendarPromotionPreview({
      ...baseInput,
      baseNightlyRate: 31,
      cleaningFee: 0,
      startDate: "2030-06-01",
      endDate: "2030-06-02",
      proposal: { ...baseInput.proposal, discountPercent: 10 },
    });

    expect(quote.accommodationSubtotal).toBe(27.9);
    expect(quote.total).toBe(27.9);
  });

  it("includes cleaning in the guest total and removes it only when waived", () => {
    const charged = computeCalendarPromotionPreview(baseInput).quote;
    const waived = computeCalendarPromotionPreview({
      ...baseInput,
      proposal: { ...baseInput.proposal, freeCleaning: true },
    }).quote;

    expect(charged.cleaningFee).toBe(30);
    expect(charged.total).toBe(270);
    expect(waived.cleaningFee).toBe(0);
    expect(waived.cleaningDiscount).toBe(30);
    expect(waived.total).toBe(240);
  });

  it("replaces the promotion being edited instead of quoting its stale version", () => {
    const { quote, proposedPromotionApplied } = computeCalendarPromotionPreview({
      ...baseInput,
      promotions: [
        {
          id: "editing",
          type: "PERCENT_DISCOUNT",
          discountPercent: 50,
          minimumNights: 1,
          startDate: "2030-06-01T00:00:00.000Z",
          endDate: "2030-06-04T00:00:00.000Z",
        },
      ],
      proposal: { ...baseInput.proposal, promotionId: "editing", discountPercent: 10 },
    });

    expect(proposedPromotionApplied).toBe(true);
    expect(quote.accommodationDiscount).toBe(30);
  });

  it("keeps canonical dated-over-evergreen priority and reports when another offer wins", () => {
    const { quote, proposedPromotionApplied } = computeCalendarPromotionPreview({
      ...baseInput,
      promotions: [
        {
          id: "existing-dated",
          type: "PERCENT_DISCOUNT",
          discountPercent: 25,
          minimumNights: 2,
          startDate: "2030-06-01T00:00:00.000Z",
          endDate: "2030-06-04T00:00:00.000Z",
        },
        {
          id: "evergreen",
          type: "PERCENT_DISCOUNT",
          discountPercent: 50,
          minimumNights: 1,
        },
      ],
      proposal: { ...baseInput.proposal, minimumNights: 1 },
    });

    expect(proposedPromotionApplied).toBe(false);
    expect(quote.appliedPromotion?.id).toBe("existing-dated");
    expect(quote.accommodationSubtotal).toBe(225);
  });

  it("treats the UI end date as the exclusive checkout boundary", () => {
    const { quote } = computeCalendarPromotionPreview({
      ...baseInput,
      startDate: "2030-06-01",
      endDate: "2030-06-02",
    });

    expect(quote.nights).toBe(1);
    expect(quote.nightlyBreakdown.map((night) => night.date)).toEqual([
      "2030-06-01",
    ]);
  });

  it("formats official EUR and MKD without changing quote arithmetic", () => {
    const { quote } = computeCalendarPromotionPreview(baseInput);

    expect(quote.total).toBe(270);
    expect(formatMoney(quote.total, "EUR", "en")).toContain("270");
    expect(formatMoney(quote.total, "MKD", "mk")).toContain("270");
    // The booking service currently adds a zero service fee; the preview must not
    // invent one outside the canonical quote.
    expect(quote.originalTotal - quote.discountAmount).toBe(quote.total);
  });

  it("uses canonical rounding and cleaning rules for the evergreen base example", () => {
    const quote = computeEvergreenPromotionBaseExample({
      baseNightlyRate: 99,
      cleaningFee: 30,
      nights: 2,
      proposal: {
        discountPercent: 10,
        minimumNights: 2,
        freeCleaning: true,
        roundToWholeUnit: true,
      },
    });

    expect(quote.nights).toBe(2);
    expect(quote.accommodationSubtotal).toBe(178);
    expect(quote.cleaningFee).toBe(0);
    expect(quote.total).toBe(178);
  });
});

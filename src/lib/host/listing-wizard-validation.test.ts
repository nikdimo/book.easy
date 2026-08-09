import { describe, expect, it } from "vitest";
import { promotionWizardIssues } from "@/lib/host/listing-wizard-validation";

const emptyPromotion = {
  promotionType: "NONE",
  promotionPercent: "",
  promotionMinimumNights: "",
  promotionFreeCleaning: "false",
};

describe("promotionWizardIssues", () => {
  it("allows the optional promotion step to remain empty", () => {
    expect(promotionWizardIssues(emptyPromotion)).toEqual([]);
  });

  it("blocks zero nights for a percentage promotion", () => {
    expect(
      promotionWizardIssues({
        ...emptyPromotion,
        promotionType: "PERCENT_DISCOUNT",
        promotionPercent: "20",
        promotionMinimumNights: "0",
      }),
    ).toEqual([
      {
        field: "promotionMinimumNights",
        message: "Promotion minimum stay must be between 1 and 365 nights.",
      },
    ]);
  });

  it("blocks invalid percentages and stays above the maximum", () => {
    expect(
      promotionWizardIssues({
        ...emptyPromotion,
        promotionType: "PERCENT_DISCOUNT",
        promotionPercent: "4.5",
        promotionMinimumNights: "366",
      }),
    ).toHaveLength(2);
  });

  it("accepts the inclusive boundaries", () => {
    expect(
      promotionWizardIssues({
        ...emptyPromotion,
        promotionType: "PERCENT_DISCOUNT",
        promotionPercent: "5",
        promotionMinimumNights: "1",
      }),
    ).toEqual([]);
    expect(
      promotionWizardIssues({
        ...emptyPromotion,
        promotionType: "PERCENT_DISCOUNT",
        promotionPercent: "50",
        promotionMinimumNights: "365",
      }),
    ).toEqual([]);
  });

  it("requires a valid stay threshold for free cleaning", () => {
    expect(
      promotionWizardIssues({
        ...emptyPromotion,
        promotionType: "FREE_CLEANING",
        promotionMinimumNights: "0",
        promotionFreeCleaning: "true",
      }),
    ).toHaveLength(1);
  });
});

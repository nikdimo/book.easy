export type PromotionWizardValues = {
  promotionType: string;
  promotionPercent: string;
  promotionMinimumNights: string;
  promotionFreeCleaning: string;
};

export type PromotionWizardIssue = {
  field: "promotionPercent" | "promotionMinimumNights";
  message: string;
};

/** Mirrors submitNewListing's promotion limits so the wizard can block navigation
 * before an invalid launch promotion reaches Review. The server remains authoritative. */
export function promotionWizardIssues(
  values: PromotionWizardValues,
): PromotionWizardIssue[] {
  const hasPercentOffer =
    values.promotionType === "PERCENT_DISCOUNT" ||
    values.promotionPercent.trim() !== "";
  const hasFreeCleaning =
    values.promotionType === "FREE_CLEANING" ||
    values.promotionFreeCleaning === "true";
  const hasLaunchOffer = hasPercentOffer || hasFreeCleaning;
  const issues: PromotionWizardIssue[] = [];

  const percent = Number(values.promotionPercent);
  if (
    hasPercentOffer &&
    (!Number.isInteger(percent) || percent < 5 || percent > 50)
  ) {
    issues.push({
      field: "promotionPercent",
      message: "Promotion discount must be a whole number between 5% and 50%.",
    });
  }

  const minimumNights = Number(values.promotionMinimumNights);
  if (
    hasLaunchOffer &&
    (!Number.isInteger(minimumNights) ||
      minimumNights < 1 ||
      minimumNights > 365)
  ) {
    issues.push({
      field: "promotionMinimumNights",
      message: "Promotion minimum stay must be between 1 and 365 nights.",
    });
  }

  return issues;
}

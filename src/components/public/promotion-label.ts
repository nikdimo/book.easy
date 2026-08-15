"use client";

import { interpolate } from "@/lib/i18n/client";
import type { Resolved } from "@/lib/i18n/t";
import type { StayPromotion } from "@/lib/utils/stay-pricing";

/** Just the part of the client translator this needs, so a server-resolved catalog
 * could feed it too. */
type Resolver = { resolve(key: string, source: string): Resolved };

/**
 * One offer, said the way the guest reads it: the discount first, the condition
 * attached. Shared so the widget's badge and the listing's offer list can never
 * describe the same promotion differently.
 */
export function resolvePromotionLabel(
  i18n: Resolver,
  promotion: StayPromotion,
): Resolved {
  const percent = promotion.discountPercent ?? 0;
  const minimumNights = promotion.minimumNights;

  if (percent > 0) {
    return minimumNights
      ? interpolate(
          i18n.resolve(
            "promotion.percent_min_nights",
            "{percent}% off · {n}+ nights",
          ),
          { percent, n: minimumNights },
        )
      : interpolate(i18n.resolve("promotion.percent_off", "{percent}% off"), {
          percent,
        });
  }

  return minimumNights
    ? interpolate(
        i18n.resolve(
          "promotion.free_cleaning_min_nights",
          "Free cleaning · {n}+ nights",
        ),
        { n: minimumNights },
      )
    : i18n.resolve("promotion.free_cleaning", "Free cleaning");
}

/**
 * The offers worth listing on a listing page: still running, and actually worth
 * something. An expired window or an offer that discounts nothing is noise.
 */
export function listablePromotions(
  promotions: StayPromotion[],
  today = new Date(),
): StayPromotion[] {
  return promotions
    .filter((promotion) => {
      const offersSomething =
        (promotion.discountPercent ?? 0) > 0 ||
        promotion.freeCleaning ||
        promotion.type === "FREE_CLEANING";
      if (!offersSomething) return false;

      const endDate = promotion.endDate ? new Date(promotion.endDate) : null;
      return !endDate || Number.isNaN(endDate.getTime()) || endDate >= today;
    })
    .sort(
      (left, right) =>
        (left.minimumNights ?? 0) - (right.minimumNights ?? 0) ||
        (right.discountPercent ?? 0) - (left.discountPercent ?? 0),
    );
}

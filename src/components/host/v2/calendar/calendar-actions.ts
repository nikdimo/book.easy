"use client";

import {
  clearCalendarDatePrice,
  hideListingFromCalendar,
  publishListingFromCalendar,
  removeCalendarPromotion,
  saveCalendarDefaultPricing,
  saveCalendarPromotion,
  setCalendarAvailabilityMode,
  setCalendarDatePrice,
} from "@/lib/actions/calendar.actions";
import {
  blockCalendarDatesForV2,
  openCalendarDatesForV2,
} from "@/lib/actions/calendar-v2.actions";
import type { MutationStep } from "@/lib/host/v2/calendar-review";

/**
 * The only place in the v2 calendar that changes anything.
 *
 * It takes the steps a reviewed plan produced and hands each one to the existing
 * server action for that job — the same actions the current panel calls, with the same
 * session check, ownership check and validation on the server side. Nothing here
 * decides *whether* a change is allowed; it only carries an already-reviewed decision.
 *
 * Steps run in order and stop at the first failure, so a partial save is reported as
 * one rather than silently swallowed.
 */
export async function runMutationStep(
  listingId: string,
  step: MutationStep,
): Promise<{ error?: string; success?: string }> {
  switch (step.type) {
    case "OPEN_RANGE":
      // The v2 pair, not the shared one: on a closed-by-default listing the shared
      // actions redefine blocking as "delete the availability window", which is the
      // behaviour v2 deliberately no longer has. See calendar-v2.actions.ts.
      return openCalendarDatesForV2(listingId, {
        startDate: step.startDate,
        endDate: step.endDate,
      });
    case "BLOCK_RANGE":
      return blockCalendarDatesForV2(listingId, {
        startDate: step.startDate,
        endDate: step.endDate,
        // Stored on the MANUAL_BLOCK rows the canonical service creates. Nothing
        // guest-facing reads that column.
        reason: step.note,
      });
    case "SET_DATE_PRICE":
      return setCalendarDatePrice(listingId, {
        startDate: step.startDate,
        endDate: step.endDate,
        nightlyRate: step.nightlyRate,
      });
    case "CLEAR_DATE_PRICE":
      return clearCalendarDatePrice(listingId, {
        startDate: step.startDate,
        endDate: step.endDate,
      });
    case "SAVE_PROMOTION":
      return saveCalendarPromotion(listingId, {
        promotionId: step.promotionId,
        discountPercent: step.discountPercent,
        minimumNights: step.minimumNights,
        freeCleaning: step.freeCleaning,
        roundToWholeUnit: step.roundToWholeUnit,
        startDate: step.startDate,
        endDate: step.endDate,
      });
    case "PUBLISH_LISTING":
      return publishListingFromCalendar(listingId);
    case "HIDE_LISTING":
      return hideListingFromCalendar(listingId);
    case "SET_AVAILABILITY_MODE":
      return setCalendarAvailabilityMode(listingId, step.mode);
    case "SET_MIN_NIGHTS":
      return saveCalendarDefaultPricing(listingId, {
        baseNightlyRate: step.baseNightlyRate,
        cleaningFee: step.cleaningFee,
        minNights: step.minNights,
      });
    case "SET_DEFAULT_PRICING":
      return saveCalendarDefaultPricing(listingId, {
        baseNightlyRate: step.baseNightlyRate,
        cleaningFee: step.cleaningFee,
        minNights: step.minNights,
      });
    case "SAVE_EVERGREEN_PROMOTION":
      return saveCalendarPromotion(listingId, {
        promotionId: step.promotionId,
        discountPercent: step.discountPercent,
        minimumNights: step.minimumNights,
        freeCleaning: step.freeCleaning,
        roundToWholeUnit: step.roundToWholeUnit,
        // Deliberately omit dates. The canonical action interprets that exact shape
        // as an always-active offer; sending the visible calendar horizon would turn
        // it into a date promotion and silently change its meaning.
      });
    case "REMOVE_PROMOTION":
      return removeCalendarPromotion(listingId, step.promotionId);
  }
}

export async function runMutationSteps(
  listingId: string,
  steps: MutationStep[],
): Promise<{ error?: string; completed: number }> {
  let completed = 0;
  for (const step of steps) {
    const result = await runMutationStep(listingId, step);
    if (result?.error) return { error: result.error, completed };
    completed += 1;
  }
  return { completed };
}

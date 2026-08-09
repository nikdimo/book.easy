"use server";

import {
  blockAllFutureDates,
  blockDates,
  closeAvailabilityWindowRange,
  makeAllFutureDatesAvailable,
  openAvailabilityWindowRange,
  removeListingDatePriceRange,
  unblockDateRange,
  upsertListingDatePriceRange,
  setListingAvailabilityMode,
} from "@/lib/actions/availability.actions";
import { submitForReview, unpublishListing } from "@/lib/actions/listing.actions";
import { db } from "@/lib/db";
import { saveListingPricing } from "@/lib/actions/pricing.actions";
import {
  disableListingPromotion,
  type ListingPromotionInput,
  upsertListingPromotion,
} from "@/lib/actions/promotion.actions";

export type CalendarActionResult =
  { success?: string; error?: string } | undefined | void;

function normalizedResult(
  result: { error?: string; success?: boolean | string } | undefined,
  success: string,
): { error?: string; success?: string } {
  if (result?.error) return { error: result.error };
  return {
    success: typeof result?.success === "string" ? result.success : success,
  };
}

function rangeFormData(
  listingId: string,
  input: { startDate: string; endDate: string },
) {
  const formData = new FormData();
  formData.set("listingId", listingId);
  formData.set("startDate", input.startDate);
  formData.set("endDate", input.endDate);
  return formData;
}

export async function setCalendarDatePrice(
  listingId: string,
  input: { startDate: string; endDate: string; nightlyRate: number },
) {
  const formData = rangeFormData(listingId, input);
  formData.set("nightlyRate", String(input.nightlyRate));
  const result = await upsertListingDatePriceRange(formData);
  return normalizedResult(result, "Custom price saved.");
}

export async function clearCalendarDatePrice(
  listingId: string,
  input: { startDate: string; endDate: string },
) {
  const result = await removeListingDatePriceRange(
    rangeFormData(listingId, input),
  );
  return normalizedResult(result, "Default price restored for these dates.");
}

export async function blockCalendarRange(
  listingId: string,
  input: { startDate: string; endDate: string; reason?: string },
) {
  const formData = rangeFormData(listingId, input);
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { availabilityMode: true },
  });
  if (listing?.availabilityMode === "CLOSED") {
    const result = await closeAvailabilityWindowRange(formData);
    return normalizedResult(result, "Dates closed.");
  }
  if (input.reason) formData.set("reason", input.reason);
  const result = await blockDates(formData);
  return normalizedResult(result, "Dates blocked.");
}

export async function openCalendarRange(
  listingId: string,
  input: { startDate: string; endDate: string },
) {
  const formData = rangeFormData(listingId, input);
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { availabilityMode: true },
  });
  const result =
    listing?.availabilityMode === "CLOSED"
      ? await openAvailabilityWindowRange(formData)
      : await unblockDateRange(formData);
  return normalizedResult(result, "Dates made available.");
}

export async function blockCalendarFuture(listingId: string) {
  const result = await blockAllFutureDates(listingId);
  return normalizedResult(result, "All future dates blocked.");
}

export async function openCalendarFuture(listingId: string) {
  const result = await makeAllFutureDatesAvailable(listingId);
  return normalizedResult(result, "All manual future blocks removed.");
}

export async function setCalendarAvailabilityMode(
  listingId: string,
  mode: "OPEN" | "CLOSED",
) {
  const result = await setListingAvailabilityMode(listingId, mode);
  return normalizedResult(
    result,
    mode === "CLOSED"
      ? "Only explicitly opened dates are now bookable."
      : "Dates are now open unless you block them.",
  );
}

export async function saveCalendarDefaultPricing(
  listingId: string,
  input: {
    baseNightlyRate: number;
    cleaningFee: number;
    minNights: number;
  },
) {
  const formData = new FormData();
  formData.set("baseNightlyRate", String(input.baseNightlyRate));
  formData.set("cleaningFee", String(input.cleaningFee));
  formData.set("minNights", String(input.minNights));
  return saveListingPricing(listingId, {}, formData);
}

export async function saveCalendarPromotion(
  listingId: string,
  input: ListingPromotionInput,
) {
  return upsertListingPromotion(listingId, input);
}

export async function removeCalendarPromotion(
  listingId: string,
  promotionId: string,
) {
  return disableListingPromotion(listingId, promotionId);
}

export async function hideListingFromCalendar(listingId: string) {
  const result = await unpublishListing(listingId);
  return result?.error
    ? { error: result.error }
    : { success: "Listing hidden from the site." };
}

/** Counterpart to hideListingFromCalendar — puts a hidden/draft listing back on the
 * site, so the visibility switch in the calendar editor works in both directions. */
export async function publishListingFromCalendar(listingId: string) {
  const result = await submitForReview(listingId);
  return result?.error
    ? { error: result.error }
    : { success: "Listing is live on the site." };
}

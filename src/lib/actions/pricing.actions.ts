"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { actionText } from "@/lib/actions/action-text";
import {
  createDefaultPricingForManagedListing,
  saveDefaultPricingForManagedListing,
} from "@/lib/services/pricing-promotion-mutation.service";

export type PricingActionState = {
  error?: string;
  success?: string;
};

async function requireOwnedListing(listingId: string) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: await actionText("action.error.not_authorized_sentence", "Not authorized.") };
  }
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    select: { id: true, slug: true, availabilityMode: true },
  });
  if (!listing) return { error: await actionText("action.error.listing_not_found_sentence", "Listing not found.") };
  return { listing, actorId: session.user.id };
}

/**
 * Change what a listing charges: the nightly rate and the cleaning fee.
 *
 * Money only, and deliberately so. A `minNights` field used to be read off this form
 * and written with the amounts, so a Pricing page rendered before a booking-rule edit
 * could save its stale minimum back over the new one. Stay limits are written by
 * `setListingStayLimits` from Availability → Booking rules and by nothing else; any
 * `minNights` or `maxNights` in this form data is ignored.
 */
export async function saveListingPricing(
  listingId: string,
  _previousState: PricingActionState,
  formData: FormData,
): Promise<PricingActionState> {
  const owned = await requireOwnedListing(listingId);
  if ("error" in owned) return { error: owned.error };
  return saveDefaultPricingForManagedListing(owned.listing, owned.actorId, {
    baseNightlyRate: Number(formData.get("baseNightlyRate")),
    cleaningFee: Number(formData.get("cleaningFee")),
  });
}

/**
 * Give a listing its very first pricing rule.
 *
 * Separate from `saveListingPricing` because it is a different event with a different
 * audit action, and because the save path legitimately refuses when there is no rule to
 * update — that refusal is what used to leave the Pricing section with nothing to
 * offer a listing that had never been priced.
 *
 * The same session and ownership check as every other pricing write; the service does
 * the validation, the audit log and the revalidation.
 *
 * Two amounts, like every other pricing write. The new rule needs *some* minimum stay
 * in the column, but that is a database default the service supplies; it is not asked
 * for here and the Pricing UI never sends it. The host chooses it, if they ever want
 * something other than "any length", under Availability → Booking rules.
 */
export async function createListingPricing(
  listingId: string,
  input: { baseNightlyRate: number; cleaningFee: number },
): Promise<PricingActionState> {
  const owned = await requireOwnedListing(listingId);
  if ("error" in owned) return { error: owned.error };
  return createDefaultPricingForManagedListing(
    owned.listing,
    owned.actorId,
    input,
  );
}

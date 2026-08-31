"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
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
    return { error: "Not authorized." as const };
  }
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    select: { id: true, slug: true, availabilityMode: true },
  });
  if (!listing) return { error: "Listing not found." as const };
  return { listing, actorId: session.user.id };
}

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
    minNights: Number(formData.get("minNights")),
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
 */
export async function createListingPricing(
  listingId: string,
  input: { baseNightlyRate: number; cleaningFee: number; minNights: number },
): Promise<PricingActionState> {
  const owned = await requireOwnedListing(listingId);
  if ("error" in owned) return { error: owned.error };
  return createDefaultPricingForManagedListing(
    owned.listing,
    owned.actorId,
    input,
  );
}

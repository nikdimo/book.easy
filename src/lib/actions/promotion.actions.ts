"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  disableAllPromotionsForManagedListing,
  removePromotionForManagedListing,
  savePromotionForManagedListing,
  type ListingPromotionInput,
} from "@/lib/services/pricing-promotion-mutation.service";

export type { ListingPromotionInput } from "@/lib/services/pricing-promotion-mutation.service";

export type PromotionActionState = {
  error?: string;
  success?: string;
};

async function requireWebPromotionListing(listingId: string) {
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

export async function upsertListingPromotion(
  listingId: string,
  input: ListingPromotionInput,
): Promise<PromotionActionState> {
  const managed = await requireWebPromotionListing(listingId);
  if ("error" in managed) return { error: managed.error };
  return savePromotionForManagedListing(managed.listing, managed.actorId, input);
}

export async function disableListingPromotion(
  listingId: string,
  promotionId: string,
): Promise<PromotionActionState> {
  const managed = await requireWebPromotionListing(listingId);
  if ("error" in managed) return { error: managed.error };
  return removePromotionForManagedListing(
    managed.listing,
    managed.actorId,
    promotionId,
  );
}

/** Compatibility adapter for the existing standalone form. */
export async function saveListingPromotion(
  listingId: string,
  _previousState: PromotionActionState,
  formData: FormData,
): Promise<PromotionActionState> {
  const managed = await requireWebPromotionListing(listingId);
  if ("error" in managed) return { error: managed.error };
  const type = String(formData.get("type") ?? "NONE");
  if (type === "NONE") {
    return disableAllPromotionsForManagedListing(managed.listing);
  }
  const minimumNights =
    formData.get("eligibility") === "MINIMUM"
      ? Number(formData.get("minimumNights"))
      : 1;
  return savePromotionForManagedListing(managed.listing, managed.actorId, {
    discountPercent:
      type === "PERCENT_DISCOUNT" ? Number(formData.get("discountPercent")) : 0,
    minimumNights,
    freeCleaning: type === "FREE_CLEANING",
    roundToWholeUnit: formData.get("roundToWholeUnit") !== "false",
  });
}

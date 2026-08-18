"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveDefaultPricingForManagedListing } from "@/lib/services/pricing-promotion-mutation.service";

export type PricingActionState = {
  error?: string;
  success?: string;
};

export async function saveListingPricing(
  listingId: string,
  _previousState: PricingActionState,
  formData: FormData,
): Promise<PricingActionState> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized." };
  }
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    select: { id: true, slug: true, availabilityMode: true },
  });
  if (!listing) return { error: "Listing not found." };
  return saveDefaultPricingForManagedListing(listing, session.user.id, {
    baseNightlyRate: Number(formData.get("baseNightlyRate")),
    cleaningFee: Number(formData.get("cleaningFee")),
    minNights: Number(formData.get("minNights")),
  });
}

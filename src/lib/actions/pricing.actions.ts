"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/services/audit.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";

export type PricingActionState = {
  error?: string;
  success?: string;
};

const pricingSchema = z.object({
  baseNightlyRate: z.coerce.number().min(1, "Nightly rate must be at least 1."),
  cleaningFee: z.coerce.number().min(0, "Cleaning fee cannot be negative."),
  minNights: z.coerce.number().int().min(1).max(365),
});

export async function saveListingPricing(
  listingId: string,
  _previousState: PricingActionState,
  formData: FormData
): Promise<PricingActionState> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized." };
  }

  const parsed = pricingSchema.safeParse({
    baseNightlyRate: formData.get("baseNightlyRate"),
    cleaningFee: formData.get("cleaningFee"),
    minNights: formData.get("minNights"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid pricing." };
  }

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    select: {
      id: true,
      slug: true,
      pricingRule: { select: { id: true, maxNights: true } },
    },
  });
  if (!listing) return { error: "Listing not found." };
  if (!listing.pricingRule) return { error: "Listing pricing is not configured." };
  if (parsed.data.minNights > listing.pricingRule.maxNights) {
    return {
      error: `Minimum stay cannot exceed ${listing.pricingRule.maxNights} nights.`,
    };
  }
  const pricingRuleId = listing.pricingRule.id;

  const removedFreeCleaningBenefits = await db.$transaction(async (tx) => {
    await tx.pricingRule.update({
      where: { id: pricingRuleId },
      data: parsed.data,
    });

    if (parsed.data.cleaningFee !== 0) return 0;

    const result = await tx.listingPromotion.updateMany({
      where: {
        listingId: listing.id,
        disabledAt: null,
        freeCleaning: true,
      },
      data: { freeCleaning: false },
    });
    return result.count;
  });

  await createAuditLog({
    userId: session.user.id,
    action: "listing.pricing_updated",
    entityType: "Listing",
    entityId: listing.id,
    metadata: parsed.data,
  });

  revalidatePath(`/host/listings/${listingId}/pricing`);
  revalidatePath(`/host/listings/${listingId}/availability`);
  revalidatePath(`/host/listings/${listingId}/edit`);
  revalidatePath("/host/listings");
  revalidatePath(`/properties/${listing.slug}`);
  revalidatePublicListingCaches();

  return {
    success:
      removedFreeCleaningBenefits > 0
        ? "Pricing saved. Free-cleaning benefits were removed from active promotions."
        : "Pricing saved.",
  };
}

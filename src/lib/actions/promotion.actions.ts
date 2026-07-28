"use server";

import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/services/audit.service";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import { revalidatePath } from "next/cache";

export type PromotionActionState = {
  error?: string;
  success?: string;
};

const promotionSchema = z
  .object({
    type: z.enum(["NONE", "PERCENT_DISCOUNT", "FREE_CLEANING"]),
    discountPercent: z.coerce.number().int().min(5).max(50).optional(),
    minimumNights: z.coerce.number().int().min(1).max(365).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.type === "PERCENT_DISCOUNT" &&
      value.discountPercent == null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["discountPercent"],
        message: "Choose a discount between 5% and 50%.",
      });
    }
  });

export async function saveListingPromotion(
  listingId: string,
  _previousState: PromotionActionState,
  formData: FormData
): Promise<PromotionActionState> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized." };
  }

  const parsed = promotionSchema.safeParse({
    type: formData.get("type"),
    discountPercent:
      formData.get("type") === "PERCENT_DISCOUNT"
        ? formData.get("discountPercent")
        : undefined,
    minimumNights:
      formData.get("eligibility") === "MINIMUM"
        ? formData.get("minimumNights")
        : undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid promotion." };
  }

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    include: { pricingRule: true },
  });
  if (!listing) return { error: "Listing not found." };
  if (listing.status !== "APPROVED") {
    return { error: "Publish the listing before adding a special offer." };
  }
  if (!listing.pricingRule) return { error: "Listing pricing is not configured." };

  const data = parsed.data;
  if (
    data.type === "FREE_CLEANING" &&
    Number(listing.pricingRule.cleaningFee) <= 0
  ) {
    return { error: "Add a cleaning fee before offering free cleaning." };
  }
  if (
    data.minimumNights != null &&
    data.minimumNights > listing.pricingRule.maxNights
  ) {
    return {
      error: `The offer minimum cannot exceed ${listing.pricingRule.maxNights} nights.`,
    };
  }

  const now = new Date();
  const created = await db.$transaction(async (tx) => {
    await tx.listingPromotion.updateMany({
      where: { listingId, disabledAt: null },
      data: { disabledAt: now },
    });

    if (data.type === "NONE") return null;

    return tx.listingPromotion.create({
      data: {
        listingId,
        type: data.type,
        discountPercent:
          data.type === "PERCENT_DISCOUNT" ? data.discountPercent : null,
        minimumNights: data.minimumNights ?? null,
      },
    });
  });

  await createAuditLog({
    userId: session.user.id,
    action: created ? "listing.promotion_saved" : "listing.promotion_disabled",
    entityType: "Listing",
    entityId: listingId,
    metadata: created
      ? {
          promotionId: created.id,
          type: created.type,
          discountPercent: created.discountPercent,
          minimumNights: created.minimumNights,
        }
      : undefined,
  });

  revalidatePath(`/host/listings/${listingId}/promotion`);
  revalidatePath(`/host/listings/${listingId}/edit`);
  revalidatePath("/host/listings");
  revalidatePath(`/properties/${listing.slug}`);
  revalidatePublicListingCaches();

  return {
    success: created ? "Special offer saved." : "Special offer turned off.",
  };
}

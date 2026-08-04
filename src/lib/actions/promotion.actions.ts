"use server";

import { PromotionType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/services/audit.service";
import { compareYmd, ymdToDbDate } from "@/lib/utils/date-only";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";

export type PromotionActionState = {
  error?: string;
  success?: string;
};

export type ListingPromotionInput = {
  promotionId?: string;
  discountPercent: number;
  minimumNights: number;
  freeCleaning: boolean;
  roundToWholeUnit: boolean;
  startDate?: string;
  endDate?: string;
};

const promotionInputSchema = z
  .object({
    promotionId: z.string().cuid().optional(),
    discountPercent: z.coerce.number().int().min(0).max(50),
    minimumNights: z.coerce.number().int().min(1).max(365),
    freeCleaning: z.boolean(),
    roundToWholeUnit: z.boolean(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.discountPercent === 0 && !value.freeCleaning) {
      ctx.addIssue({
        code: "custom",
        path: ["discountPercent"],
        message: "Add a discount, free cleaning, or both.",
      });
    }
    if (Boolean(value.startDate) !== Boolean(value.endDate)) {
      ctx.addIssue({
        code: "custom",
        path: ["startDate"],
        message: "Choose both a start date and an end date.",
      });
    }
    if (
      value.startDate &&
      value.endDate &&
      compareYmd(value.endDate, value.startDate) <= 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "The promotion end date must be after its start date.",
      });
    }
  });

function promotionTypeFor(input: ListingPromotionInput): PromotionType {
  return input.discountPercent > 0
    ? PromotionType.PERCENT_DISCOUNT
    : PromotionType.FREE_CLEANING;
}

function revalidatePromotionPaths(listingId: string, slug: string) {
  revalidatePath(`/host/listings/${listingId}/availability`);
  revalidatePath(`/host/listings/${listingId}/pricing`);
  revalidatePath(`/host/listings/${listingId}/promotion`);
  revalidatePath(`/host/listings/${listingId}/edit`);
  revalidatePath("/host/listings");
  revalidatePath(`/properties/${slug}`);
  revalidatePublicListingCaches();
}

async function requirePromotionListing(listingId: string) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized." as const };
  }

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    include: {
      pricingRule: true,
      promotions: { where: { disabledAt: null } },
    },
  });
  if (!listing) return { error: "Listing not found." as const };
  if (listing.status !== "APPROVED") {
    return {
      error: "Publish the listing before adding a special offer." as const,
    };
  }
  if (!listing.pricingRule) {
    return { error: "Listing pricing is not configured." as const };
  }

  return { listing, userId: session.user.id };
}

export async function upsertListingPromotion(
  listingId: string,
  input: ListingPromotionInput,
): Promise<PromotionActionState> {
  const parsed = promotionInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid promotion.",
    };
  }

  const managed = await requirePromotionListing(listingId);
  if ("error" in managed) return { error: managed.error };
  const { listing, userId } = managed;
  const pricingRule = listing.pricingRule;
  if (!pricingRule) return { error: "Listing pricing is not configured." };
  const data = parsed.data;

  if (
    data.promotionId &&
    !listing.promotions.some((promotion) => promotion.id === data.promotionId)
  ) {
    return { error: "Promotion not found." };
  }

  if (data.freeCleaning && Number(pricingRule.cleaningFee) <= 0) {
    return { error: "Add a cleaning fee before offering free cleaning." };
  }
  if (data.minimumNights > pricingRule.maxNights) {
    return {
      error: `The offer minimum cannot exceed ${pricingRule.maxNights} nights.`,
    };
  }

  const startDate = data.startDate ? ymdToDbDate(data.startDate) : null;
  const endDate = data.endDate ? ymdToDbDate(data.endDate) : null;
  const conflict = listing.promotions.find((promotion) => {
    if (promotion.id === data.promotionId) return false;
    const existingMinimum = promotion.minimumNights ?? pricingRule.minNights;
    if (existingMinimum !== data.minimumNights) return false;

    const existingAlways = !promotion.startDate && !promotion.endDate;
    const incomingAlways = !startDate && !endDate;
    if (existingAlways || incomingAlways) {
      return existingAlways && incomingAlways;
    }
    return promotion.startDate! < endDate! && promotion.endDate! > startDate!;
  });
  if (conflict) {
    return {
      error:
        "Another promotion already uses this minimum stay for an overlapping date scope.",
    };
  }

  const saved = data.promotionId
    ? await db.listingPromotion.update({
        where: { id: data.promotionId, listingId },
        data: {
          type: promotionTypeFor(data),
          discountPercent: data.discountPercent,
          minimumNights: data.minimumNights,
          freeCleaning: data.freeCleaning,
          roundToWholeUnit:
            data.discountPercent > 0 && data.roundToWholeUnit,
          startDate,
          endDate,
        },
      })
    : await db.listingPromotion.create({
        data: {
          listingId,
          type: promotionTypeFor(data),
          discountPercent: data.discountPercent,
          minimumNights: data.minimumNights,
          freeCleaning: data.freeCleaning,
          roundToWholeUnit:
            data.discountPercent > 0 && data.roundToWholeUnit,
          startDate,
          endDate,
        },
      });

  await createAuditLog({
    userId,
    action: data.promotionId
      ? "listing.promotion_updated"
      : "listing.promotion_created",
    entityType: "Listing",
    entityId: listingId,
    metadata: {
      promotionId: saved.id,
      discountPercent: saved.discountPercent,
      minimumNights: saved.minimumNights,
      freeCleaning: saved.freeCleaning,
      roundToWholeUnit: saved.roundToWholeUnit,
      startDate: saved.startDate?.toISOString() ?? null,
      endDate: saved.endDate?.toISOString() ?? null,
    },
  });

  revalidatePromotionPaths(listingId, listing.slug);
  return {
    success: data.promotionId ? "Promotion updated." : "Promotion created.",
  };
}

export async function disableListingPromotion(
  listingId: string,
  promotionId: string,
): Promise<PromotionActionState> {
  const managed = await requirePromotionListing(listingId);
  if ("error" in managed) return { error: managed.error };
  const { listing, userId } = managed;

  const promotion = listing.promotions.find((row) => row.id === promotionId);
  if (!promotion) return { error: "Promotion not found." };

  await db.listingPromotion.update({
    where: { id: promotionId },
    data: { disabledAt: new Date() },
  });
  await createAuditLog({
    userId,
    action: "listing.promotion_disabled",
    entityType: "Listing",
    entityId: listingId,
    metadata: { promotionId },
  });

  revalidatePromotionPaths(listingId, listing.slug);
  return { success: "Promotion removed." };
}

/**
 * Compatibility adapter for the existing standalone form. The unified calendar
 * uses upsertListingPromotion directly.
 */
export async function saveListingPromotion(
  listingId: string,
  _previousState: PromotionActionState,
  formData: FormData,
): Promise<PromotionActionState> {
  const type = String(formData.get("type") ?? "NONE");
  if (type === "NONE") {
    const managed = await requirePromotionListing(listingId);
    if ("error" in managed) return { error: managed.error };
    await db.listingPromotion.updateMany({
      where: { listingId, disabledAt: null },
      data: { disabledAt: new Date() },
    });
    revalidatePromotionPaths(listingId, managed.listing.slug);
    return { success: "Special offers turned off." };
  }

  const minimumNights =
    formData.get("eligibility") === "MINIMUM"
      ? Number(formData.get("minimumNights"))
      : 1;
  return upsertListingPromotion(listingId, {
    discountPercent:
      type === "PERCENT_DISCOUNT" ? Number(formData.get("discountPercent")) : 0,
    minimumNights,
    freeCleaning: type === "FREE_CLEANING",
    roundToWholeUnit: formData.get("roundToWholeUnit") !== "false",
  });
}

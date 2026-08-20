import "server-only";

import { PromotionType } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createAuditLog } from "@/lib/services/audit.service";
import type { ManagedAvailabilityListing } from "@/lib/services/availability-mutation.service";
import { compareYmd, ymdToDbDate } from "@/lib/utils/date-only";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";

export type ListingPromotionInput = {
  promotionId?: string;
  discountPercent: number;
  minimumNights: number;
  freeCleaning: boolean;
  roundToWholeUnit: boolean;
  startDate?: string;
  endDate?: string;
};

const pricingSchema = z.object({
  baseNightlyRate: z.coerce.number().min(1, "Nightly rate must be at least 1."),
  cleaningFee: z.coerce.number().min(0, "Cleaning fee cannot be negative."),
  minNights: z.coerce.number().int().min(1).max(365),
});

const promotionInputSchema = z
  .object({
    promotionId: z.string().cuid().optional(),
    discountPercent: z.coerce.number().int().min(0).max(50),
    minimumNights: z.coerce.number().int().min(1).max(365),
    freeCleaning: z.boolean(),
    roundToWholeUnit: z.boolean(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

function revalidatePricingPaths(listing: ManagedAvailabilityListing) {
  revalidatePath(`/host/listings/${listing.id}/pricing`);
  revalidatePath(`/host/listings/${listing.id}/availability`);
  revalidatePath(`/host/listings/${listing.id}/edit`);
  revalidatePath("/host/listings");
  if (listing.slug) revalidatePath(`/properties/${listing.slug}`);
  revalidatePublicListingCaches();
}

function revalidatePromotionPaths(listing: ManagedAvailabilityListing) {
  revalidatePath(`/host/listings/${listing.id}/availability`);
  revalidatePath(`/host/listings/${listing.id}/pricing`);
  revalidatePath(`/host/listings/${listing.id}/promotion`);
  revalidatePath(`/host/listings/${listing.id}/edit`);
  revalidatePath("/host/listings");
  if (listing.slug) revalidatePath(`/properties/${listing.slug}`);
  revalidatePublicListingCaches();
}

export async function saveDefaultPricingForManagedListing(
  listing: ManagedAvailabilityListing,
  actorId: string,
  input: { baseNightlyRate: number; cleaningFee: number; minNights: number },
) {
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid pricing." };
  }
  const pricingRule = await db.pricingRule.findUnique({
    where: { listingId: listing.id },
    select: { id: true, maxNights: true },
  });
  if (!pricingRule) return { error: "Listing pricing is not configured." };
  if (parsed.data.minNights > pricingRule.maxNights) {
    return { error: `Minimum stay cannot exceed ${pricingRule.maxNights} nights.` };
  }
  const removedFreeCleaningBenefits = await db.$transaction(async (tx) => {
    await tx.pricingRule.update({
      where: { id: pricingRule.id },
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
    userId: actorId,
    action: "listing.pricing_updated",
    entityType: "Listing",
    entityId: listing.id,
    metadata: parsed.data,
  });
  revalidatePricingPaths(listing);
  return {
    success:
      removedFreeCleaningBenefits > 0
        ? "Pricing saved. Free-cleaning benefits were removed from active promotions."
        : "Pricing saved.",
  };
}

function promotionTypeFor(input: ListingPromotionInput): PromotionType {
  return input.discountPercent > 0
    ? PromotionType.PERCENT_DISCOUNT
    : PromotionType.FREE_CLEANING;
}

async function promotionListing(listingId: string) {
  return db.listing.findUnique({
    where: { id: listingId },
    include: {
      pricingRule: true,
      promotions: { where: { disabledAt: null } },
    },
  });
}

export async function savePromotionForManagedListing(
  listingContext: ManagedAvailabilityListing,
  actorId: string,
  input: ListingPromotionInput,
) {
  const parsed = promotionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid promotion." };
  }
  const listing = await promotionListing(listingContext.id);
  if (!listing) return { error: "Listing not found." };
  if (listing.status !== "APPROVED") {
    return { error: "Publish the listing before adding a special offer." };
  }
  if (!listing.pricingRule) return { error: "Listing pricing is not configured." };
  const data = parsed.data;
  const pricingRule = listing.pricingRule;
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
    return { error: `The offer minimum cannot exceed ${pricingRule.maxNights} nights.` };
  }
  const startDate = data.startDate ? ymdToDbDate(data.startDate) : null;
  const endDate = data.endDate ? ymdToDbDate(data.endDate) : null;
  const saved = data.promotionId
    ? await db.listingPromotion.update({
        where: { id: data.promotionId, listingId: listing.id },
        data: {
          type: promotionTypeFor(data),
          discountPercent: data.discountPercent,
          minimumNights: data.minimumNights,
          freeCleaning: data.freeCleaning,
          roundToWholeUnit: data.discountPercent > 0 && data.roundToWholeUnit,
          startDate,
          endDate,
        },
      })
    : await db.listingPromotion.create({
        data: {
          listingId: listing.id,
          type: promotionTypeFor(data),
          discountPercent: data.discountPercent,
          minimumNights: data.minimumNights,
          freeCleaning: data.freeCleaning,
          roundToWholeUnit: data.discountPercent > 0 && data.roundToWholeUnit,
          startDate,
          endDate,
        },
      });
  await createAuditLog({
    userId: actorId,
    action: data.promotionId
      ? "listing.promotion_updated"
      : "listing.promotion_created",
    entityType: "Listing",
    entityId: listing.id,
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
  revalidatePromotionPaths(listingContext);
  return { success: data.promotionId ? "Promotion updated." : "Promotion created." };
}

export async function removePromotionForManagedListing(
  listingContext: ManagedAvailabilityListing,
  actorId: string,
  promotionId: string,
) {
  const listing = await promotionListing(listingContext.id);
  if (!listing) return { error: "Listing not found." };
  if (listing.status !== "APPROVED") {
    return { error: "Publish the listing before adding a special offer." };
  }
  if (!listing.pricingRule) return { error: "Listing pricing is not configured." };
  if (!listing.promotions.some((promotion) => promotion.id === promotionId)) {
    return { error: "Promotion not found." };
  }
  await db.listingPromotion.update({
    where: { id: promotionId, listingId: listing.id },
    data: { disabledAt: new Date() },
  });
  await createAuditLog({
    userId: actorId,
    action: "listing.promotion_disabled",
    entityType: "Listing",
    entityId: listing.id,
    metadata: { promotionId },
  });
  revalidatePromotionPaths(listingContext);
  return { success: "Promotion removed." };
}

export async function disableAllPromotionsForManagedListing(
  listingContext: ManagedAvailabilityListing,
) {
  const listing = await promotionListing(listingContext.id);
  if (!listing) return { error: "Listing not found." };
  if (listing.status !== "APPROVED") {
    return { error: "Publish the listing before adding a special offer." };
  }
  if (!listing.pricingRule) return { error: "Listing pricing is not configured." };
  await db.listingPromotion.updateMany({
    where: { listingId: listingContext.id, disabledAt: null },
    data: { disabledAt: new Date() },
  });
  revalidatePromotionPaths(listingContext);
  return { success: "Special offers turned off." };
}

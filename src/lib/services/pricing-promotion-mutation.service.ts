import "server-only";

import { PromotionType } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import { createAuditLog } from "@/lib/services/audit.service";
import type { ManagedAvailabilityListing } from "@/lib/services/availability-mutation.service";
import { stayLengthCap } from "@/lib/utils/booking-selection";
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

/**
 * What a pricing write is allowed to contain: two amounts.
 *
 * `minNights` used to be part of this schema, which made every price save a stay-rule
 * save as well — a Pricing screen rendered before the host changed their minimum stay
 * elsewhere would write its stale copy back on the next save. Stay limits are owned by
 * `setListingStayLimits` (Availability → Booking rules); nothing in this file writes
 * `minNights` or `maxNights` on an existing rule.
 */
const pricingSchema = z.object({
  baseNightlyRate: z.coerce.number().min(1, "Nightly rate must be at least 1."),
  cleaningFee: z.coerce.number().min(0, "Cleaning fee cannot be negative."),
});

/**
 * The minimum stay a brand-new rule is created with.
 *
 * A neutral database default rather than a product decision: 1 constrains nothing, so
 * a listing priced for the first time behaves exactly as it did before it had a rule.
 * Set on the server precisely so no pricing form has to ask for it or carry it.
 */
const NEUTRAL_MIN_NIGHTS = 1;

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
  // The V2 equivalents of each of the four above. Pricing is edited from the V2
  // calendar and the V2 pricing section now, so leaving these out meant the surface
  // that made the change was the one still showing the old number.
  revalidatePath(`/host/listings/${listing.id}/pricing`);
  revalidatePath(`/host/listings/${listing.id}/availability`);
  revalidatePath(`/host/listings/${listing.id}`);
  revalidatePath("/host/listings");
  revalidatePath("/host/calendar");
  if (listing.slug) revalidatePath(`/properties/${listing.slug}`);
  revalidatePublicListingCaches();
}

function revalidatePromotionPaths(listing: ManagedAvailabilityListing) {
  revalidatePath(`/host/listings/${listing.id}/availability`);
  revalidatePath(`/host/listings/${listing.id}/pricing`);
  revalidatePath(`/host/listings/${listing.id}/promotion`);
  revalidatePath(`/host/listings/${listing.id}/edit`);
  revalidatePath("/host/listings");
  // V2 has no separate promotion route: promotions are a lens of the calendar, which
  // is why `/host/calendar` stands in for the classic `/promotion` path.
  revalidatePath(`/host/listings/${listing.id}/availability`);
  revalidatePath(`/host/listings/${listing.id}/pricing`);
  revalidatePath(`/host/listings/${listing.id}`);
  revalidatePath("/host/listings");
  revalidatePath("/host/calendar");
  if (listing.slug) revalidatePath(`/properties/${listing.slug}`);
  revalidatePublicListingCaches();
}

/**
 * The listing's first pricing rule.
 *
 * Almost every listing gets one when it is created, nested in the same write as the
 * listing itself, so this is the recovery path rather than the normal one: an imported
 * listing, or one from before that create existed, reaches the Pricing section with no
 * rule at all and cannot be published, cannot be quoted, and — until now — could not be
 * given a price from the page that is supposed to own its price.
 *
 * No schema change was needed for it. `PricingRule` already defaults the currency, the
 * maximum stay and the service fee, so the two amounts a host actually chooses are the
 * two the form asks for, the minimum stay is the neutral default below, and the rest
 * are the same defaults every other listing was created with.
 *
 * Deliberately refuses when a rule already exists rather than overwriting one: this is
 * "there is nothing here yet", and `saveDefaultPricingForManagedListing` is the path
 * for changing what is. Two functions that can both create leave two audit trails for
 * the same event and no way to tell which one a host used.
 */
export async function createDefaultPricingForManagedListing(
  listing: ManagedAvailabilityListing,
  actorId: string,
  input: { baseNightlyRate: number; cleaningFee: number },
) {
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid pricing." };
  }
  const existing = await db.pricingRule.findUnique({
    where: { listingId: listing.id },
    select: { id: true },
  });
  if (existing) return { error: "This listing already has pricing." };

  const created = { ...parsed.data, minNights: NEUTRAL_MIN_NIGHTS };
  await db.pricingRule.create({
    data: {
      listingId: listing.id,
      // The platform's authoring currency, which is what every other listing's rule is
      // created with and what the schema itself defaults to. Nothing here changes the
      // currency of a listing that already has one.
      currency: BASE_CURRENCY,
      ...created,
    },
  });
  await createAuditLog({
    userId: actorId,
    action: "listing.pricing_created",
    entityType: "Listing",
    entityId: listing.id,
    metadata: created,
  });
  revalidatePricingPaths(listing);
  return { success: "Pricing saved." };
}

/**
 * Change an existing rule's amounts.
 *
 * The update is narrowed to exactly the parsed amounts, so a caller that passes extra
 * fields — an older client, a stale form — cannot reach the stay-limit columns through
 * this path. That is why there is no maximum-stay comparison left here either: this
 * function no longer writes a minimum for one to constrain.
 */
export async function saveDefaultPricingForManagedListing(
  listing: ManagedAvailabilityListing,
  actorId: string,
  input: { baseNightlyRate: number; cleaningFee: number },
) {
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid pricing." };
  }
  const pricingRule = await db.pricingRule.findUnique({
    where: { listingId: listing.id },
    select: { id: true },
  });
  if (!pricingRule) return { error: "Listing pricing is not configured." };
  const cascade = await db.$transaction(async (tx) => {
    await tx.pricingRule.update({
      where: { id: pricingRule.id },
      data: {
        baseNightlyRate: parsed.data.baseNightlyRate,
        cleaningFee: parsed.data.cleaningFee,
      },
    });
    if (parsed.data.cleaningFee !== 0) return { cleared: 0, disabled: 0 };

    // Two different promotions are affected, and they must not be treated the same way.
    //
    // An offer that also carries a percentage discount survives without its cleaning
    // benefit: clearing the flag leaves a smaller but real offer. An offer whose *only*
    // benefit was the free cleaning has nothing left, and the database says so — the
    // `ListingPromotion_benefit_check` constraint requires
    // `discountPercent > 0 OR freeCleaning = true`, so clearing the flag on one of those
    // rows raises a check violation that rolls back this whole transaction. A host with
    // a free-cleaning-only offer therefore could not set their cleaning fee to zero at
    // all; they got a raw Postgres error and an unsaved price.
    //
    // So the worthless offer is disabled rather than emptied. That is also what the host
    // means: the benefit they were advertising no longer exists.
    const disabled = await tx.listingPromotion.updateMany({
      where: {
        listingId: listing.id,
        disabledAt: null,
        freeCleaning: true,
        discountPercent: { lte: 0 },
      },
      data: { disabledAt: new Date() },
    });
    const cleared = await tx.listingPromotion.updateMany({
      where: {
        listingId: listing.id,
        disabledAt: null,
        freeCleaning: true,
      },
      data: { freeCleaning: false },
    });
    return { cleared: cleared.count, disabled: disabled.count };
  });
  await createAuditLog({
    userId: actorId,
    action: "listing.pricing_updated",
    entityType: "Listing",
    entityId: listing.id,
    metadata: parsed.data,
  });
  revalidatePricingPaths(listing);
  return { success: pricingSavedMessage(cascade) };
}

/** What the cleaning-fee cascade actually did, said plainly enough to act on. */
function pricingSavedMessage(cascade: { cleared: number; disabled: number }) {
  if (cascade.disabled > 0 && cascade.cleared > 0) {
    return "Pricing saved. Free-cleaning benefits were removed from active promotions, and offers left with nothing to give were switched off.";
  }
  if (cascade.disabled > 0) {
    return "Pricing saved. Offers whose only benefit was free cleaning were switched off.";
  }
  if (cascade.cleared > 0) {
    return "Pricing saved. Free-cleaning benefits were removed from active promotions.";
  }
  return "Pricing saved.";
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
  // A stored `maxNights` of zero is the product-wide spelling of "no maximum", so the
  // column is read through `stayLengthCap` here exactly as booking, search and the host
  // calendar read it. Comparing against the raw column made every promotion on an
  // uncapped listing fail with "cannot exceed 0 nights."
  const stayCap = stayLengthCap(pricingRule.maxNights);
  if (stayCap !== null && data.minimumNights > stayCap) {
    return { error: `The offer minimum cannot exceed ${stayCap} nights.` };
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

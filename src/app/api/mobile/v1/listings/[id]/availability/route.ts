import {
  blockAllFutureDates,
  blockDates,
  makeAllFutureDatesAvailable,
  removeListingDatePriceRange,
  unblockDateRange,
  unblockDates,
  upsertListingDatePriceRange,
} from "@/lib/actions/availability.actions";
import {
  removeCalendarPromotion,
  saveCalendarDefaultPricing,
  saveCalendarPromotion,
} from "@/lib/actions/calendar.actions";
import { db } from "@/lib/db";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";
import { dbDateToYmd, ymdToDbDate } from "@/lib/utils/date-only";
import { format } from "date-fns";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

async function managedListing(id: string, userId: string, isAdmin: boolean) {
  return db.listing.findFirst({
    where: { id, ...(isAdmin ? {} : { hostId: userId }) },
    select: {
      id: true,
      title: true,
      status: true,
      pricingRule: {
        select: {
          baseNightlyRate: true,
          cleaningFee: true,
          minNights: true,
          maxNights: true,
          currency: true,
        },
      },
      promotions: {
        where: { disabledAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          discountPercent: true,
          minimumNights: true,
          freeCleaning: true,
          roundToWholeUnit: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;
  const { id } = await context.params;

  const listing = await managedListing(id, access.user.id, access.user.role === "ADMIN");
  if (!listing) {
    return mobileJson(request, { error: "Listing not found" }, { status: 404 });
  }

  const today = ymdToDbDate(format(new Date(), "yyyy-MM-dd"));
  const [blocks, prices] = await Promise.all([
    db.availabilityBlock.findMany({
      where: { listingId: id, endDate: { gte: today } },
      orderBy: { startDate: "asc" },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            guest: { select: { name: true } },
          },
        },
      },
    }),
    db.listingDatePrice.findMany({
      where: { listingId: id, date: { gte: today } },
      orderBy: { date: "asc" },
    }),
  ]);

  return mobileJson(request, {
    listing: {
      id: listing.id,
      title: listing.title,
      status: listing.status,
      baseNightlyRate: listing.pricingRule
        ? Number(listing.pricingRule.baseNightlyRate)
        : null,
      cleaningFee: listing.pricingRule ? Number(listing.pricingRule.cleaningFee) : 0,
      minNights: listing.pricingRule?.minNights ?? 1,
      // The promotion form needs this: an offer minimum above the listing maximum
      // is rejected server-side, so the client can say so first.
      maxNights: listing.pricingRule?.maxNights ?? 365,
      currency: listing.pricingRule?.currency ?? "EUR",
    },
    // Dates are sent as plain yyyy-MM-dd. A promotion window is a calendar range,
    // not an instant, so serialising it as an ISO timestamp invites a timezone
    // shift that moves the offer by a day.
    promotions: listing.promotions.map((promotion) => ({
      id: promotion.id,
      discountPercent: promotion.discountPercent,
      minimumNights: promotion.minimumNights ?? 1,
      freeCleaning: promotion.freeCleaning,
      roundToWholeUnit: promotion.roundToWholeUnit,
      startDate: promotion.startDate ? dbDateToYmd(promotion.startDate) : null,
      endDate: promotion.endDate ? dbDateToYmd(promotion.endDate) : null,
    })),
    blocks: blocks.map((block) => ({
      ...block,
      startDate: block.startDate.toISOString(),
      endDate: block.endDate.toISOString(),
    })),
    prices: prices.map((price) => ({
      id: price.id,
      date: price.date.toISOString(),
      nightlyRate: Number(price.nightlyRate),
    })),
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;
  const { id } = await context.params;

  let input: {
    action?:
      | "block"
      | "makeAvailable"
      | "setPrice"
      | "resetPrice"
      | "blockAllFuture"
      | "makeAllFutureAvailable"
      | "saveDefaultPricing"
      | "savePromotion"
      | "removePromotion";
    startDate?: string;
    endDate?: string;
    reason?: string;
    nightlyRate?: number;
    baseNightlyRate?: number;
    cleaningFee?: number;
    minNights?: number;
    promotionId?: string;
    discountPercent?: number;
    minimumNights?: number;
    freeCleaning?: boolean;
    roundToWholeUnit?: boolean;
  };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }

  // Pricing and promotions go through calendar.actions, the same entry point the
  // web workspace uses — so the 50% cap, the free-cleaning fee requirement, the
  // overlap check and the round-up rule are enforced in exactly one place.
  if (input.action === "saveDefaultPricing") {
    const result = await saveCalendarDefaultPricing(id, {
      baseNightlyRate: Number(input.baseNightlyRate),
      cleaningFee: Number(input.cleaningFee ?? 0),
      minNights: Number(input.minNights ?? 1),
    });
    if (result?.error) return mobileJson(request, result, { status: 400 });
    return mobileJson(request, result ?? { success: true });
  }

  if (input.action === "savePromotion") {
    const result = await saveCalendarPromotion(id, {
      promotionId: input.promotionId,
      discountPercent: Number(input.discountPercent ?? 0),
      minimumNights: Number(input.minimumNights ?? 1),
      freeCleaning: Boolean(input.freeCleaning),
      roundToWholeUnit: Boolean(input.roundToWholeUnit),
      startDate: input.startDate || undefined,
      endDate: input.endDate || undefined,
    });
    if (result?.error) return mobileJson(request, result, { status: 400 });
    return mobileJson(request, result ?? { success: true });
  }

  if (input.action === "removePromotion") {
    if (!input.promotionId) {
      return mobileJson(request, { error: "Promotion id is required" }, { status: 400 });
    }
    const result = await removeCalendarPromotion(id, input.promotionId);
    if (result?.error) return mobileJson(request, result, { status: 400 });
    return mobileJson(request, result ?? { success: true });
  }

  // blockDates returns a message instead of `true` when the range was already
  // fully covered, so the client can say so rather than claim a no-op worked.
  let result: { success?: boolean | string; error?: string };
  if (input.action === "blockAllFuture") {
    result = await blockAllFutureDates(id);
  } else if (input.action === "makeAllFutureAvailable") {
    result = await makeAllFutureDatesAvailable(id);
  } else {
    const formData = new FormData();
    formData.set("listingId", id);
    formData.set("startDate", input.startDate ?? "");
    formData.set("endDate", input.endDate ?? "");
    if (input.reason) formData.set("reason", input.reason);
    if (input.nightlyRate != null) {
      formData.set("nightlyRate", String(input.nightlyRate));
    }

    if (input.action === "makeAvailable") {
      result = await unblockDateRange(formData);
    } else if (input.action === "setPrice") {
      result = await upsertListingDatePriceRange(formData);
    } else if (input.action === "resetPrice") {
      result = await removeListingDatePriceRange(formData);
    } else {
      result = await blockDates(formData);
    }
  }

  if ("error" in result) {
    return mobileJson(request, result, { status: 400 });
  }
  return mobileJson(request, result);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;
  await context.params;

  let input: { blockId?: string };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }
  if (!input.blockId) {
    return mobileJson(request, { error: "Block id is required" }, { status: 400 });
  }

  const result = await unblockDates(input.blockId);
  if ("error" in result) {
    return mobileJson(request, result, { status: 400 });
  }
  return mobileJson(request, result);
}

import { db } from "@/lib/db";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";
import { dbDateToYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  mutateAvailabilityForManagedListing,
  removeManualBlockForManagedListing,
  resetDatePriceRangeForManagedListing,
  setDatePriceRangeForManagedListing,
  verifyAvailabilityManager,
} from "@/lib/services/availability-mutation.service";
import {
  removePromotionForManagedListing,
  saveDefaultPricingForManagedListing,
  savePromotionForManagedListing,
} from "@/lib/services/pricing-promotion-mutation.service";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

async function managedListing(id: string, userId: string, isAdmin: boolean) {
  return db.listing.findFirst({
    where: { id, ...(isAdmin ? {} : { hostId: userId }) },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      availabilityMode: true,
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

  const today = ymdToDbDate(todayYmd());
  const [blocks, availabilityWindows, prices] = await Promise.all([
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
    db.listingAvailabilityWindow.findMany({
      where: { listingId: id, endDate: { gte: today } },
      orderBy: { startDate: "asc" },
    }),
    db.listingDatePrice.findMany({
      where: { listingId: id, date: { gte: today } },
      orderBy: { date: "asc" },
    }),
  ]);

  return mobileJson(request, {
    listing: {
      id: listing.id,
      slug: listing.slug,
      title: listing.title,
      status: listing.status,
      availabilityMode: listing.availabilityMode,
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
    availabilityWindows: availabilityWindows.map((window) => ({
      id: window.id,
      startDate: window.startDate.toISOString(),
      endDate: window.endDate.toISOString(),
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
  const verifiedListing = await verifyAvailabilityManager(
    { id: access.user.id, role: access.user.role },
    id,
  );
  if (!verifiedListing) {
    return mobileJson(request, { error: "Listing not found" }, { status: 404 });
  }

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

  // Native bearer requests and cookie-authenticated web actions enter the same
  // internal cores after their respective ownership checks. Validation therefore
  // stays canonical without exposing an actor-accepting Server Action.
  if (input.action === "saveDefaultPricing") {
    const result = await saveDefaultPricingForManagedListing(
      verifiedListing,
      access.user.id,
      {
        baseNightlyRate: Number(input.baseNightlyRate),
        cleaningFee: Number(input.cleaningFee ?? 0),
        minNights: Number(input.minNights ?? 1),
      },
    );
    if (result?.error) return mobileJson(request, result, { status: 400 });
    return mobileJson(request, result ?? { success: true });
  }

  if (input.action === "savePromotion") {
    const result = await savePromotionForManagedListing(
      verifiedListing,
      access.user.id,
      {
        promotionId: input.promotionId,
        discountPercent: Number(input.discountPercent ?? 0),
        minimumNights: Number(input.minimumNights ?? 1),
        freeCleaning: Boolean(input.freeCleaning),
        roundToWholeUnit: Boolean(input.roundToWholeUnit),
        startDate: input.startDate || undefined,
        endDate: input.endDate || undefined,
      },
    );
    if (result?.error) return mobileJson(request, result, { status: 400 });
    return mobileJson(request, result ?? { success: true });
  }

  if (input.action === "removePromotion") {
    if (!input.promotionId) {
      return mobileJson(request, { error: "Promotion id is required" }, { status: 400 });
    }
    const result = await removePromotionForManagedListing(
      verifiedListing,
      access.user.id,
      input.promotionId,
    );
    if (result?.error) return mobileJson(request, result, { status: 400 });
    return mobileJson(request, result ?? { success: true });
  }

  // blockDates returns a message instead of `true` when the range was already
  // fully covered, so the client can say so rather than claim a no-op worked.
  let result: { success?: boolean | string; error?: string };
  if (input.action === "blockAllFuture") {
    result = await mutateAvailabilityForManagedListing(
      verifiedListing,
      "BLOCK_FUTURE",
    );
  } else if (input.action === "makeAllFutureAvailable") {
    result = await mutateAvailabilityForManagedListing(
      verifiedListing,
      "OPEN_FUTURE",
    );
  } else {
    if (input.action === "makeAvailable") {
      result = await mutateAvailabilityForManagedListing(
        verifiedListing,
        "OPEN_RANGE",
        {
          startDate: input.startDate ?? "",
          endDate: input.endDate ?? "",
        },
      );
    } else if (input.action === "setPrice") {
      result = await setDatePriceRangeForManagedListing(verifiedListing, {
        startDate: input.startDate ?? "",
        endDate: input.endDate ?? "",
        nightlyRate: Number(input.nightlyRate),
      });
    } else if (input.action === "resetPrice") {
      result = await resetDatePriceRangeForManagedListing(verifiedListing, {
        startDate: input.startDate ?? "",
        endDate: input.endDate ?? "",
      });
    } else {
      result = await mutateAvailabilityForManagedListing(
        verifiedListing,
        "BLOCK_RANGE",
        {
          startDate: input.startDate ?? "",
          endDate: input.endDate ?? "",
          reason: input.reason,
        },
      );
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
  const { id } = await context.params;
  const verifiedListing = await verifyAvailabilityManager(
    { id: access.user.id, role: access.user.role },
    id,
  );
  if (!verifiedListing) {
    return mobileJson(request, { error: "Listing not found" }, { status: 404 });
  }

  let input: { blockId?: string };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }
  if (!input.blockId) {
    return mobileJson(request, { error: "Block id is required" }, { status: 400 });
  }

  const result = await removeManualBlockForManagedListing(
    verifiedListing,
    input.blockId,
  );
  if ("error" in result) {
    return mobileJson(request, result, { status: 400 });
  }
  return mobileJson(request, result);
}

import {
  blockAllFutureDates,
  blockDates,
  makeAllFutureDatesAvailable,
  removeListingDatePriceRange,
  unblockDateRange,
  unblockDates,
  upsertListingDatePriceRange,
} from "@/lib/actions/availability.actions";
import { db } from "@/lib/db";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";
import { ymdToDbDate } from "@/lib/utils/date-only";
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
      pricingRule: {
        select: { baseNightlyRate: true, currency: true },
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
      baseNightlyRate: listing.pricingRule
        ? Number(listing.pricingRule.baseNightlyRate)
        : null,
      currency: listing.pricingRule?.currency ?? "EUR",
    },
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
      | "makeAllFutureAvailable";
    startDate?: string;
    endDate?: string;
    reason?: string;
    nightlyRate?: number;
  };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }

  let result: { success?: boolean; error?: string };
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

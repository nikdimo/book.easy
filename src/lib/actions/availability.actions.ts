"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BlockType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  compareYmd,
  dbDateToYmd,
  eachYmdExclusive,
  ymdToDbDate,
} from "@/lib/utils/date-only";
import { isAvailabilityOverlapConstraintError } from "@/lib/utils/db-errors";
import { format } from "date-fns";

async function getListingForManager(userId: string, role: string, listingId: string) {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    include: { pricingRule: true },
  });
  if (!listing) return null;
  if (role === "ADMIN") return listing;
  if (listing.hostId === userId) return listing;
  return null;
}

function revalidateListingPaths(listingId: string, slug?: string | null) {
  revalidatePath(`/host/listings/${listingId}/availability`);
  revalidatePath(`/admin/listings/${listingId}`);
  if (slug) revalidatePath(`/properties/${slug}`);
}

async function requireManagedListing(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" as const };
  const listing = await getListingForManager(
    session.user.id,
    session.user.role,
    listingId
  );
  if (!listing) return { error: "Listing not found" as const };
  return { listing };
}

function validateRange(startDate: string, endDate: string) {
  try {
    const start = ymdToDbDate(startDate);
    const end = ymdToDbDate(endDate);

    if (compareYmd(endDate, startDate) <= 0) {
      return { error: "End date must be after start date" as const };
    }

    return { startDate, endDate, start, end };
  } catch {
    return { error: "Invalid date range" as const };
  }
}

export async function blockDates(formData: FormData) {
  const listingId = formData.get("listingId") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const reason = formData.get("reason") as string;

  if (!listingId || !startDate || !endDate) {
    return { error: "Missing required fields" };
  }

  const listingResult = await requireManagedListing(listingId);
  if ("error" in listingResult) return { error: listingResult.error };
  const listing = listingResult.listing;

  const range = validateRange(startDate, endDate);
  if ("error" in range) return { error: range.error };
  const { start, end } = range;

  try {
    await db.$transaction(async (tx) => {
      // Same lock key as createBooking's transaction so a manual block and a concurrent
      // booking request for this listing can't both pass their overlap check at once.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;

      const overlap = await tx.availabilityBlock.findFirst({
        where: {
          listingId,
          startDate: { lt: end },
          endDate: { gt: start },
        },
      });

      if (overlap) {
        throw new Error("These dates overlap with an existing block or booking");
      }

      await tx.availabilityBlock.create({
        data: {
          listingId,
          startDate: start,
          endDate: end,
          blockType: BlockType.MANUAL_BLOCK,
          reason: reason || null,
        },
      });
    });
  } catch (error) {
    if (isAvailabilityOverlapConstraintError(error)) {
      return { error: "These dates overlap with an existing block or booking" };
    }
    return { error: error instanceof Error ? error.message : "Failed to block dates" };
  }

  revalidateListingPaths(listingId, listing.slug);
  return { success: true };
}

export async function unblockDates(blockId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" };

  const block = await db.availabilityBlock.findUnique({
    where: { id: blockId },
    include: { listing: true },
  });

  if (!block) return { error: "Block not found" };

  const listing = await getListingForManager(
    session.user.id,
    session.user.role,
    block.listingId
  );
  if (!listing) return { error: "Not authorized" };

  if (block.blockType !== "MANUAL_BLOCK") {
    return { error: "Only manual blocks can be removed" };
  }

  await db.availabilityBlock.delete({ where: { id: blockId } });

  revalidateListingPaths(block.listingId, block.listing.slug);
  return { success: true };
}

export async function unblockDateRange(formData: FormData) {
  const listingId = formData.get("listingId") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  if (!listingId || !startDate || !endDate) {
    return { error: "Missing required fields" };
  }

  const listingResult = await requireManagedListing(listingId);
  if ("error" in listingResult) return { error: listingResult.error };
  const listing = listingResult.listing;

  const range = validateRange(startDate, endDate);
  if ("error" in range) return { error: range.error };
  const { startDate: rangeStartYmd, endDate: rangeEndYmd, start, end } = range;

  await db.$transaction(async (tx) => {
    const overlapping = await tx.availabilityBlock.findMany({
      where: {
        listingId,
        blockType: BlockType.MANUAL_BLOCK,
        startDate: { lt: end },
        endDate: { gt: start },
      },
      orderBy: { startDate: "asc" },
    });

    for (const block of overlapping) {
      const blockStartYmd = dbDateToYmd(block.startDate);
      const blockEndYmd = dbDateToYmd(block.endDate);
      const removeWhole =
        compareYmd(rangeStartYmd, blockStartYmd) <= 0 &&
        compareYmd(rangeEndYmd, blockEndYmd) >= 0;
      const trimStart =
        compareYmd(rangeStartYmd, blockStartYmd) <= 0 &&
        compareYmd(rangeEndYmd, blockEndYmd) < 0;
      const trimEnd =
        compareYmd(rangeStartYmd, blockStartYmd) > 0 &&
        compareYmd(rangeEndYmd, blockEndYmd) >= 0;
      const split =
        compareYmd(rangeStartYmd, blockStartYmd) > 0 &&
        compareYmd(rangeEndYmd, blockEndYmd) < 0;

      if (removeWhole) {
        await tx.availabilityBlock.delete({ where: { id: block.id } });
      } else if (trimStart) {
        await tx.availabilityBlock.update({
          where: { id: block.id },
          data: { startDate: ymdToDbDate(rangeEndYmd) },
        });
      } else if (trimEnd) {
        await tx.availabilityBlock.update({
          where: { id: block.id },
          data: { endDate: ymdToDbDate(rangeStartYmd) },
        });
      } else if (split) {
        await tx.availabilityBlock.update({
          where: { id: block.id },
          data: { endDate: ymdToDbDate(rangeStartYmd) },
        });
        await tx.availabilityBlock.create({
          data: {
            listingId,
            startDate: ymdToDbDate(rangeEndYmd),
            endDate: ymdToDbDate(blockEndYmd),
            blockType: BlockType.MANUAL_BLOCK,
            reason: block.reason,
          },
        });
      }
    }
  });

  revalidateListingPaths(listingId, listing.slug);
  return { success: true };
}

export async function blockAllFutureDates(listingId: string) {
  if (!listingId) return { error: "Missing listing id" };
  const listingResult = await requireManagedListing(listingId);
  if ("error" in listingResult) return { error: listingResult.error };
  const listing = listingResult.listing;

  const startDate = format(new Date(), "yyyy-MM-dd");
  const endDate = "2100-01-01";
  const start = ymdToDbDate(startDate);

  await db.$transaction(async (tx) => {
    const existing = await tx.availabilityBlock.findMany({
      where: {
        listingId,
        endDate: { gt: start },
      },
      orderBy: { startDate: "asc" },
      select: { startDate: true, endDate: true },
    });

    let cursorYmd = startDate;
    for (const b of existing) {
      const blockStartYmd = dbDateToYmd(b.startDate);
      const blockEndYmd = dbDateToYmd(b.endDate);

      if (compareYmd(blockStartYmd, cursorYmd) > 0) {
        await tx.availabilityBlock.create({
          data: {
            listingId,
            startDate: ymdToDbDate(cursorYmd),
            endDate: ymdToDbDate(blockStartYmd),
            blockType: BlockType.MANUAL_BLOCK,
            reason: "Bulk blocked from calendar",
          },
        });
      }

      if (compareYmd(blockEndYmd, cursorYmd) > 0) {
        cursorYmd = blockEndYmd;
      }
      if (compareYmd(cursorYmd, endDate) >= 0) break;
    }

    if (compareYmd(cursorYmd, endDate) < 0) {
      await tx.availabilityBlock.create({
        data: {
          listingId,
          startDate: ymdToDbDate(cursorYmd),
          endDate: ymdToDbDate(endDate),
          blockType: BlockType.MANUAL_BLOCK,
          reason: "Bulk blocked from calendar",
        },
      });
    }
  });

  revalidateListingPaths(listingId, listing.slug);
  return { success: true };
}

export async function makeAllFutureDatesAvailable(listingId: string) {
  if (!listingId) return { error: "Missing listing id" };
  const listingResult = await requireManagedListing(listingId);
  if ("error" in listingResult) return { error: listingResult.error };
  const listing = listingResult.listing;
  const today = ymdToDbDate(format(new Date(), "yyyy-MM-dd"));

  await db.availabilityBlock.deleteMany({
    where: {
      listingId,
      blockType: BlockType.MANUAL_BLOCK,
      endDate: { gte: today },
    },
  });

  revalidateListingPaths(listingId, listing.slug);
  return { success: true };
}

export async function upsertListingDatePrice(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" };

  const listingId = formData.get("listingId") as string;
  const dateStr = formData.get("date") as string;
  const nightlyRateRaw = formData.get("nightlyRate") as string;

  if (!listingId || !dateStr) return { error: "Missing date or listing" };

  const rate = parseFloat(nightlyRateRaw);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { error: "Enter a valid nightly price greater than zero" };
  }

  const listing = await getListingForManager(
    session.user.id,
    session.user.role,
    listingId
  );
  if (!listing || !listing.pricingRule) return { error: "Listing not found" };

  const base = Number(listing.pricingRule.baseNightlyRate);
  let day: Date;

  try {
    day = ymdToDbDate(dateStr);
  } catch {
    return { error: "Invalid date" };
  }

  if (Math.abs(rate - base) < 0.005) {
    await db.listingDatePrice.deleteMany({
      where: { listingId, date: day },
    });
  } else {
    await db.listingDatePrice.upsert({
      where: {
        listingId_date: { listingId, date: day },
      },
      create: {
        listingId,
        date: day,
        nightlyRate: rate,
      },
      update: { nightlyRate: rate },
    });
  }

  revalidateListingPaths(listingId, listing.slug);
  return { success: true };
}

export async function upsertListingDatePriceRange(formData: FormData) {
  const listingId = formData.get("listingId") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const nightlyRateRaw = formData.get("nightlyRate") as string;

  if (!listingId || !startDate || !endDate) {
    return { error: "Missing required fields" };
  }

  const rate = parseFloat(nightlyRateRaw);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { error: "Enter a valid nightly price greater than zero" };
  }

  const listingResult = await requireManagedListing(listingId);
  if ("error" in listingResult) return { error: listingResult.error };
  const listing = listingResult.listing;
  if (!listing.pricingRule) return { error: "Listing pricing is missing" };

  const range = validateRange(startDate, endDate);
  if ("error" in range) return { error: range.error };
  const { startDate: rangeStartYmd, endDate: rangeEndYmd } = range;
  const nights = eachYmdExclusive(rangeStartYmd, rangeEndYmd);
  const base = Number(listing.pricingRule.baseNightlyRate);

  await db.$transaction(async (tx) => {
    for (const nightYmd of nights) {
      const day = ymdToDbDate(nightYmd);

      if (Math.abs(rate - base) < 0.005) {
        await tx.listingDatePrice.deleteMany({
          where: { listingId, date: day },
        });
      } else {
        await tx.listingDatePrice.upsert({
          where: { listingId_date: { listingId, date: day } },
          create: { listingId, date: day, nightlyRate: rate },
          update: { nightlyRate: rate },
        });
      }
    }
  });

  revalidateListingPaths(listingId, listing.slug);
  return { success: true };
}

export async function removeListingDatePrice(priceId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" };

  const row = await db.listingDatePrice.findUnique({
    where: { id: priceId },
    include: { listing: true },
  });

  if (!row) return { error: "Price override not found" };

  const listing = await getListingForManager(
    session.user.id,
    session.user.role,
    row.listingId
  );
  if (!listing) return { error: "Not authorized" };

  await db.listingDatePrice.delete({ where: { id: priceId } });

  revalidateListingPaths(row.listingId, row.listing.slug);
  return { success: true };
}

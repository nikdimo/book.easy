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
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import {
  resetDatePriceRangeForManagedListing,
  setDatePriceRangeForManagedListing,
} from "@/lib/services/availability-mutation.service";

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
  revalidatePath(`/host/listings/${listingId}/pricing`);
  // Host V2 renders the same availability from its own routes, so it needs its own
  // entries here — the classic paths above do not cover them and a host who changed a
  // date in V2 would keep reading the pre-change answer.
  revalidatePath(`/host/listings/${listingId}/availability`);
  revalidatePath(`/host/listings/${listingId}/pricing`);
  revalidatePath(`/host/listings/${listingId}`);
  revalidatePath("/host/calendar");
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
  const { startDate: rangeStartYmd, endDate: rangeEndYmd, start, end } = range;

  let coveredNights = 0;
  try {
    await db.$transaction(async (tx) => {
      // Same lock key as createBooking's transaction so a manual block and a concurrent
      // booking request for this listing can't both pass their overlap check at once.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;

      const existing = await tx.availabilityBlock.findMany({
        where: {
          listingId,
          startDate: { lt: end },
          endDate: { gt: start },
        },
        orderBy: { startDate: "asc" },
        select: { startDate: true, endDate: true },
      });

      // Blocking means "none of these nights are bookable", so an overlap is not a
      // conflict to refuse — the nights already blocked or booked are simply
      // nothing to do. Fill only the gaps between them, same as blockAllFutureDates.
      async function blockGap(fromYmd: string, toYmd: string) {
        if (compareYmd(toYmd, fromYmd) <= 0) return;
        await tx.availabilityBlock.create({
          data: {
            listingId,
            startDate: ymdToDbDate(fromYmd),
            endDate: ymdToDbDate(toYmd),
            blockType: BlockType.MANUAL_BLOCK,
            reason: reason || null,
          },
        });
        coveredNights += eachYmdExclusive(fromYmd, toYmd).length;
      }

      let cursorYmd = rangeStartYmd;
      for (const block of existing) {
        const blockStartYmd = dbDateToYmd(block.startDate);
        const blockEndYmd = dbDateToYmd(block.endDate);
        if (compareYmd(blockStartYmd, cursorYmd) > 0) {
          await blockGap(
            cursorYmd,
            compareYmd(blockStartYmd, rangeEndYmd) < 0
              ? blockStartYmd
              : rangeEndYmd,
          );
        }
        if (compareYmd(blockEndYmd, cursorYmd) > 0) cursorYmd = blockEndYmd;
        if (compareYmd(cursorYmd, rangeEndYmd) >= 0) break;
      }
      await blockGap(cursorYmd, rangeEndYmd);
    });
  } catch (error) {
    if (isAvailabilityOverlapConstraintError(error)) {
      return { error: "These dates overlap with an existing block or booking" };
    }
    return { error: error instanceof Error ? error.message : "Failed to block dates" };
  }

  revalidateListingPaths(listingId, listing.slug);
  if (coveredNights === 0) {
    return { success: "These dates were already blocked or booked." };
  }
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

/** Opens a range on a calendar that is closed by default. Overlapping and adjacent
 * windows collapse into one row so dated search can prove a whole stay is covered
 * with a single containing range. */
export async function openAvailabilityWindowRange(formData: FormData) {
  const listingId = formData.get("listingId") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  if (!listingId || !startDate || !endDate) return { error: "Missing required fields" };

  const listingResult = await requireManagedListing(listingId);
  if ("error" in listingResult) return { error: listingResult.error };
  const listing = listingResult.listing;
  const range = validateRange(startDate, endDate);
  if ("error" in range) return { error: range.error };

  await db.$transaction(async (tx) => {
    const windows = await tx.listingAvailabilityWindow.findMany({
      where: {
        listingId,
        startDate: { lte: range.end },
        endDate: { gte: range.start },
      },
    });
    let mergedStart = startDate;
    let mergedEnd = endDate;
    for (const window of windows) {
      const windowStart = dbDateToYmd(window.startDate);
      const windowEnd = dbDateToYmd(window.endDate);
      if (compareYmd(windowStart, mergedStart) < 0) mergedStart = windowStart;
      if (compareYmd(windowEnd, mergedEnd) > 0) mergedEnd = windowEnd;
    }
    if (windows.length > 0) {
      await tx.listingAvailabilityWindow.deleteMany({
        where: { id: { in: windows.map((window) => window.id) } },
      });
    }
    await tx.listingAvailabilityWindow.create({
      data: {
        listingId,
        startDate: ymdToDbDate(mergedStart),
        endDate: ymdToDbDate(mergedEnd),
      },
    });
  });

  revalidateListingPaths(listingId, listing.slug);
  return { success: true };
}

/** Closes part or all of an explicit open window without affecting reservations. */
export async function closeAvailabilityWindowRange(formData: FormData) {
  const listingId = formData.get("listingId") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  if (!listingId || !startDate || !endDate) return { error: "Missing required fields" };

  const listingResult = await requireManagedListing(listingId);
  if ("error" in listingResult) return { error: listingResult.error };
  const listing = listingResult.listing;
  const range = validateRange(startDate, endDate);
  if ("error" in range) return { error: range.error };

  await db.$transaction(async (tx) => {
    const windows = await tx.listingAvailabilityWindow.findMany({
      where: {
        listingId,
        startDate: { lt: range.end },
        endDate: { gt: range.start },
      },
    });
    for (const window of windows) {
      const windowStart = dbDateToYmd(window.startDate);
      const windowEnd = dbDateToYmd(window.endDate);
      const keepBefore = compareYmd(windowStart, startDate) < 0;
      const keepAfter = compareYmd(windowEnd, endDate) > 0;
      await tx.listingAvailabilityWindow.delete({ where: { id: window.id } });
      if (keepBefore) {
        await tx.listingAvailabilityWindow.create({
          data: { listingId, startDate: window.startDate, endDate: range.start },
        });
      }
      if (keepAfter) {
        await tx.listingAvailabilityWindow.create({
          data: { listingId, startDate: range.end, endDate: window.endDate },
        });
      }
    }
  });

  revalidateListingPaths(listingId, listing.slug);
  return { success: true };
}

export async function setListingAvailabilityMode(
  listingId: string,
  mode: "OPEN" | "CLOSED",
) {
  if (!listingId) return { error: "Missing listing id" };
  const listingResult = await requireManagedListing(listingId);
  if ("error" in listingResult) return { error: listingResult.error };
  const listing = listingResult.listing;

  await db.listing.update({
    where: { id: listingId },
    data: { availabilityMode: mode },
  });
  revalidateListingPaths(listingId, listing.slug);
  revalidatePublicListingCaches();
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

  const listingResult = await requireManagedListing(listingId);
  if ("error" in listingResult) return { error: listingResult.error };
  return setDatePriceRangeForManagedListing(listingResult.listing, {
    startDate,
    endDate,
    nightlyRate: Number(nightlyRateRaw),
  });
}

export async function removeListingDatePriceRange(formData: FormData) {
  const listingId = formData.get("listingId") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;

  if (!listingId || !startDate || !endDate) {
    return { error: "Missing required fields" };
  }

  const listingResult = await requireManagedListing(listingId);
  if ("error" in listingResult) return { error: listingResult.error };
  return resetDatePriceRangeForManagedListing(listingResult.listing, {
    startDate,
    endDate,
  });
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

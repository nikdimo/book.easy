import "server-only";

import { BlockType } from "@prisma/client";
import { db } from "@/lib/db";
import {
  compareYmd,
  dbDateToYmd,
  eachYmdExclusive,
  todayYmd,
  ymdToDbDate,
} from "@/lib/utils/date-only";
import { isAvailabilityOverlapConstraintError } from "@/lib/utils/db-errors";
import { revalidatePath } from "next/cache";

export interface AvailabilityActor {
  id: string;
  role: string;
}

export interface ManagedAvailabilityListing {
  id: string;
  slug: string | null;
  availabilityMode: "OPEN" | "CLOSED";
}

export type AvailabilityMutationRequest =
  | "OPEN_RANGE"
  | "BLOCK_RANGE"
  | "OPEN_FUTURE"
  | "BLOCK_FUTURE";

export type AvailabilityCoreOperation =
  | "REMOVE_MANUAL_RANGE"
  | "OPEN_WINDOW_RANGE"
  | "ADD_MANUAL_RANGE"
  | "CLOSE_WINDOW_RANGE"
  | "REMOVE_FUTURE_MANUAL_BLOCKS"
  | "OPEN_FUTURE_WINDOW"
  | "ADD_FUTURE_MANUAL_BLOCKS"
  | "CLOSE_FUTURE_WINDOWS";

export function resolveAvailabilityCoreOperation(
  mode: "OPEN" | "CLOSED",
  request: AvailabilityMutationRequest,
): AvailabilityCoreOperation {
  const operations = {
    OPEN: {
      OPEN_RANGE: "REMOVE_MANUAL_RANGE",
      BLOCK_RANGE: "ADD_MANUAL_RANGE",
      OPEN_FUTURE: "REMOVE_FUTURE_MANUAL_BLOCKS",
      BLOCK_FUTURE: "ADD_FUTURE_MANUAL_BLOCKS",
    },
    CLOSED: {
      OPEN_RANGE: "OPEN_WINDOW_RANGE",
      BLOCK_RANGE: "CLOSE_WINDOW_RANGE",
      OPEN_FUTURE: "OPEN_FUTURE_WINDOW",
      BLOCK_FUTURE: "CLOSE_FUTURE_WINDOWS",
    },
  } as const;
  return operations[mode][request];
}

export async function verifyAvailabilityManager(
  actor: AvailabilityActor,
  listingId: string,
): Promise<ManagedAvailabilityListing | null> {
  return db.listing.findFirst({
    where: {
      id: listingId,
      ...(actor.role === "ADMIN" ? {} : { hostId: actor.id }),
    },
    select: { id: true, slug: true, availabilityMode: true },
  });
}

function revalidateListing(listing: ManagedAvailabilityListing) {
  revalidatePath(`/host/listings/${listing.id}/availability`);
  revalidatePath(`/host/listings/${listing.id}/pricing`);
  revalidatePath(`/admin/listings/${listing.id}`);
  if (listing.slug) revalidatePath(`/properties/${listing.slug}`);
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

export async function blockRangeForManagedListing(
  listing: ManagedAvailabilityListing,
  input: { startDate: string; endDate: string; reason?: string | null },
) {
  const range = validateRange(input.startDate, input.endDate);
  if ("error" in range) return { error: range.error };
  const shouldUpdateExistingNotes = input.reason !== undefined;
  const normalizedReason = input.reason?.trim() || null;
  if (normalizedReason && normalizedReason.length > 200) {
    return { error: "Private notes must be 200 characters or fewer" };
  }
  let coveredNights = 0;
  let updatedNoteNights = 0;
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listing.id}))`;
      const existing = await tx.availabilityBlock.findMany({
        where: {
          listingId: listing.id,
          startDate: { lt: range.end },
          endDate: { gt: range.start },
        },
        orderBy: { startDate: "asc" },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          blockType: true,
          reason: true,
        },
      });
      async function blockGap(fromYmd: string, toYmd: string) {
        if (compareYmd(toYmd, fromYmd) <= 0) return;
        await tx.availabilityBlock.create({
          data: {
            listingId: listing.id,
            startDate: ymdToDbDate(fromYmd),
            endDate: ymdToDbDate(toYmd),
            blockType: BlockType.MANUAL_BLOCK,
            reason: normalizedReason,
          },
        });
        coveredNights += eachYmdExclusive(fromYmd, toYmd).length;
      }
      let cursorYmd = range.startDate;
      for (const block of existing) {
        const blockStartYmd = dbDateToYmd(block.startDate);
        const blockEndYmd = dbDateToYmd(block.endDate);
        if (compareYmd(blockStartYmd, cursorYmd) > 0) {
          await blockGap(
            cursorYmd,
            compareYmd(blockStartYmd, range.endDate) < 0
              ? blockStartYmd
              : range.endDate,
          );
        }
        if (compareYmd(blockEndYmd, cursorYmd) > 0) cursorYmd = blockEndYmd;

        // Supplying `reason` is an explicit request to make the selected part of an
        // existing manual block carry that note. Split at the selection boundaries so
        // dates outside the host's selection keep their original private note. Imported
        // blocks and reservations are never rewritten.
        if (
          shouldUpdateExistingNotes &&
          block.blockType === BlockType.MANUAL_BLOCK &&
          (block.reason?.trim() || null) !== normalizedReason
        ) {
          const overlapStart =
            compareYmd(blockStartYmd, range.startDate) > 0
              ? blockStartYmd
              : range.startDate;
          const overlapEnd =
            compareYmd(blockEndYmd, range.endDate) < 0
              ? blockEndYmd
              : range.endDate;
          await tx.availabilityBlock.delete({ where: { id: block.id } });
          if (compareYmd(blockStartYmd, overlapStart) < 0) {
            await tx.availabilityBlock.create({
              data: {
                listingId: listing.id,
                startDate: block.startDate,
                endDate: ymdToDbDate(overlapStart),
                blockType: BlockType.MANUAL_BLOCK,
                reason: block.reason,
              },
            });
          }
          await tx.availabilityBlock.create({
            data: {
              listingId: listing.id,
              startDate: ymdToDbDate(overlapStart),
              endDate: ymdToDbDate(overlapEnd),
              blockType: BlockType.MANUAL_BLOCK,
              reason: normalizedReason,
            },
          });
          if (compareYmd(overlapEnd, blockEndYmd) < 0) {
            await tx.availabilityBlock.create({
              data: {
                listingId: listing.id,
                startDate: ymdToDbDate(overlapEnd),
                endDate: block.endDate,
                blockType: BlockType.MANUAL_BLOCK,
                reason: block.reason,
              },
            });
          }
          updatedNoteNights += eachYmdExclusive(
            overlapStart,
            overlapEnd,
          ).length;
        }
        if (compareYmd(cursorYmd, range.endDate) >= 0) break;
      }
      await blockGap(cursorYmd, range.endDate);
    });
  } catch (error) {
    if (isAvailabilityOverlapConstraintError(error)) {
      return { error: "These dates overlap with an existing block or booking" };
    }
    return { error: error instanceof Error ? error.message : "Failed to block dates" };
  }
  revalidateListing(listing);
  return coveredNights === 0 && updatedNoteNights === 0
    ? { success: "These dates were already blocked or booked." }
    : { success: true };
}

export async function removeManualBlocksForManagedListing(
  listing: ManagedAvailabilityListing,
  input: { startDate: string; endDate: string },
) {
  const range = validateRange(input.startDate, input.endDate);
  if ("error" in range) return { error: range.error };
  await db.$transaction(async (tx) => {
    const overlapping = await tx.availabilityBlock.findMany({
      where: {
        listingId: listing.id,
        blockType: BlockType.MANUAL_BLOCK,
        startDate: { lt: range.end },
        endDate: { gt: range.start },
      },
      orderBy: { startDate: "asc" },
    });
    for (const block of overlapping) {
      const blockStartYmd = dbDateToYmd(block.startDate);
      const blockEndYmd = dbDateToYmd(block.endDate);
      const keepBefore = compareYmd(blockStartYmd, range.startDate) < 0;
      const keepAfter = compareYmd(blockEndYmd, range.endDate) > 0;
      await tx.availabilityBlock.delete({ where: { id: block.id } });
      if (keepBefore) {
        await tx.availabilityBlock.create({
          data: {
            listingId: listing.id,
            startDate: block.startDate,
            endDate: range.start,
            blockType: BlockType.MANUAL_BLOCK,
            reason: block.reason,
          },
        });
      }
      if (keepAfter) {
        await tx.availabilityBlock.create({
          data: {
            listingId: listing.id,
            startDate: range.end,
            endDate: block.endDate,
            blockType: BlockType.MANUAL_BLOCK,
            reason: block.reason,
          },
        });
      }
    }
  });
  revalidateListing(listing);
  return { success: true };
}

export async function openWindowForManagedListing(
  listing: ManagedAvailabilityListing,
  input: { startDate: string; endDate: string },
) {
  const range = validateRange(input.startDate, input.endDate);
  if ("error" in range) return { error: range.error };
  await db.$transaction(async (tx) => {
    const windows = await tx.listingAvailabilityWindow.findMany({
      where: {
        listingId: listing.id,
        startDate: { lte: range.end },
        endDate: { gte: range.start },
      },
    });
    let mergedStart = input.startDate;
    let mergedEnd = input.endDate;
    for (const window of windows) {
      const start = dbDateToYmd(window.startDate);
      const end = dbDateToYmd(window.endDate);
      if (compareYmd(start, mergedStart) < 0) mergedStart = start;
      if (compareYmd(end, mergedEnd) > 0) mergedEnd = end;
    }
    if (windows.length > 0) {
      await tx.listingAvailabilityWindow.deleteMany({
        where: { id: { in: windows.map((window) => window.id) } },
      });
    }
    await tx.listingAvailabilityWindow.create({
      data: {
        listingId: listing.id,
        startDate: ymdToDbDate(mergedStart),
        endDate: ymdToDbDate(mergedEnd),
      },
    });
  });
  revalidateListing(listing);
  return { success: true };
}

export async function closeWindowForManagedListing(
  listing: ManagedAvailabilityListing,
  input: { startDate: string; endDate: string },
) {
  const range = validateRange(input.startDate, input.endDate);
  if ("error" in range) return { error: range.error };
  await db.$transaction(async (tx) => {
    const windows = await tx.listingAvailabilityWindow.findMany({
      where: {
        listingId: listing.id,
        startDate: { lt: range.end },
        endDate: { gt: range.start },
      },
    });
    for (const window of windows) {
      const start = dbDateToYmd(window.startDate);
      const end = dbDateToYmd(window.endDate);
      const keepBefore = compareYmd(start, input.startDate) < 0;
      const keepAfter = compareYmd(end, input.endDate) > 0;
      await tx.listingAvailabilityWindow.delete({ where: { id: window.id } });
      if (keepBefore) {
        await tx.listingAvailabilityWindow.create({
          data: { listingId: listing.id, startDate: window.startDate, endDate: range.start },
        });
      }
      if (keepAfter) {
        await tx.listingAvailabilityWindow.create({
          data: { listingId: listing.id, startDate: range.end, endDate: window.endDate },
        });
      }
    }
  });
  revalidateListing(listing);
  return { success: true };
}

export async function blockFutureForManagedListing(listing: ManagedAvailabilityListing) {
  const startDate = todayYmd();
  const endDate = "2100-01-01";
  const start = ymdToDbDate(startDate);
  await db.$transaction(async (tx) => {
    const existing = await tx.availabilityBlock.findMany({
      where: { listingId: listing.id, endDate: { gt: start } },
      orderBy: { startDate: "asc" },
      select: { startDate: true, endDate: true },
    });
    let cursorYmd = startDate;
    for (const block of existing) {
      const blockStartYmd = dbDateToYmd(block.startDate);
      const blockEndYmd = dbDateToYmd(block.endDate);
      if (compareYmd(blockStartYmd, cursorYmd) > 0) {
        await tx.availabilityBlock.create({
          data: {
            listingId: listing.id,
            startDate: ymdToDbDate(cursorYmd),
            endDate: ymdToDbDate(blockStartYmd),
            blockType: BlockType.MANUAL_BLOCK,
            reason: "Bulk blocked from calendar",
          },
        });
      }
      if (compareYmd(blockEndYmd, cursorYmd) > 0) cursorYmd = blockEndYmd;
      if (compareYmd(cursorYmd, endDate) >= 0) break;
    }
    if (compareYmd(cursorYmd, endDate) < 0) {
      await tx.availabilityBlock.create({
        data: {
          listingId: listing.id,
          startDate: ymdToDbDate(cursorYmd),
          endDate: ymdToDbDate(endDate),
          blockType: BlockType.MANUAL_BLOCK,
          reason: "Bulk blocked from calendar",
        },
      });
    }
  });
  revalidateListing(listing);
  return { success: true };
}

export async function removeFutureManualBlocksForManagedListing(
  listing: ManagedAvailabilityListing,
) {
  await db.availabilityBlock.deleteMany({
    where: {
      listingId: listing.id,
      blockType: BlockType.MANUAL_BLOCK,
      endDate: { gte: ymdToDbDate(todayYmd()) },
    },
  });
  revalidateListing(listing);
  return { success: true };
}

export async function removeManualBlockForManagedListing(
  listing: ManagedAvailabilityListing,
  blockId: string,
) {
  const block = await db.availabilityBlock.findFirst({
    where: {
      id: blockId,
      listingId: listing.id,
      blockType: BlockType.MANUAL_BLOCK,
    },
    select: { id: true },
  });
  if (!block) return { error: "Manual block not found" };
  await db.availabilityBlock.delete({ where: { id: block.id } });
  revalidateListing(listing);
  return { success: true };
}

export async function setDatePriceRangeForManagedListing(
  listing: ManagedAvailabilityListing,
  input: { startDate: string; endDate: string; nightlyRate: number },
) {
  const rate = Number(input.nightlyRate);
  if (!Number.isFinite(rate) || rate <= 0) {
    return { error: "Enter a valid nightly price greater than zero" };
  }
  const range = validateRange(input.startDate, input.endDate);
  if ("error" in range) return { error: range.error };
  const pricingRule = await db.pricingRule.findUnique({
    where: { listingId: listing.id },
    select: { baseNightlyRate: true },
  });
  if (!pricingRule) return { error: "Listing pricing is missing" };
  const base = Number(pricingRule.baseNightlyRate);
  await db.$transaction(async (tx) => {
    for (const nightYmd of eachYmdExclusive(range.startDate, range.endDate)) {
      const date = ymdToDbDate(nightYmd);
      if (Math.abs(rate - base) < 0.005) {
        await tx.listingDatePrice.deleteMany({
          where: { listingId: listing.id, date },
        });
      } else {
        await tx.listingDatePrice.upsert({
          where: { listingId_date: { listingId: listing.id, date } },
          create: { listingId: listing.id, date, nightlyRate: rate },
          update: { nightlyRate: rate },
        });
      }
    }
  });
  revalidateListing(listing);
  return { success: true };
}

export async function resetDatePriceRangeForManagedListing(
  listing: ManagedAvailabilityListing,
  input: { startDate: string; endDate: string },
) {
  const range = validateRange(input.startDate, input.endDate);
  if ("error" in range) return { error: range.error };
  await db.listingDatePrice.deleteMany({
    where: {
      listingId: listing.id,
      date: { gte: range.start, lte: range.end },
    },
  });
  revalidateListing(listing);
  return { success: true };
}

export async function mutateAvailabilityForManagedListing(
  listing: ManagedAvailabilityListing,
  operation: AvailabilityMutationRequest,
  input?: { startDate: string; endDate: string; reason?: string | null },
) {
  const core = resolveAvailabilityCoreOperation(listing.availabilityMode, operation);
  if (core === "OPEN_FUTURE_WINDOW") {
    return openWindowForManagedListing(listing, {
      startDate: todayYmd(),
      endDate: "2100-01-01",
    });
  }
  if (core === "CLOSE_FUTURE_WINDOWS") {
    return closeWindowForManagedListing(listing, {
      startDate: todayYmd(),
      endDate: "2100-01-01",
    });
  }
  if (core === "REMOVE_FUTURE_MANUAL_BLOCKS") {
    return removeFutureManualBlocksForManagedListing(listing);
  }
  if (core === "ADD_FUTURE_MANUAL_BLOCKS") {
    return blockFutureForManagedListing(listing);
  }
  if (!input) return { error: "Missing date range" };
  if (core === "OPEN_WINDOW_RANGE") return openWindowForManagedListing(listing, input);
  if (core === "CLOSE_WINDOW_RANGE") return closeWindowForManagedListing(listing, input);
  if (core === "REMOVE_MANUAL_RANGE") {
    return removeManualBlocksForManagedListing(listing, input);
  }
  return blockRangeForManagedListing(listing, input);
}

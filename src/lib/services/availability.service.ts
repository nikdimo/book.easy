import "server-only";
import { db } from "@/lib/db";
import { addDays } from "date-fns";

export async function checkAvailability(
  listingId: string,
  checkIn: Date,
  checkOut: Date
): Promise<{ available: boolean; conflictingDates?: { start: Date; end: Date }[] }> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      availabilityMode: true,
      availabilityWindows: {
        where: { startDate: { lte: checkIn }, endDate: { gte: checkOut } },
        select: { id: true },
      },
    },
  });
  if (
    !listing ||
    (listing.availabilityMode === "CLOSED" &&
      listing.availabilityWindows.length === 0)
  ) {
    return { available: false };
  }

  const overlapping = await db.availabilityBlock.findMany({
    where: {
      listingId,
      startDate: { lt: checkOut },
      endDate: { gt: checkIn },
    },
    select: { startDate: true, endDate: true },
  });

  if (overlapping.length > 0) {
    return {
      available: false,
      conflictingDates: overlapping.map((b) => ({
        start: b.startDate,
        end: b.endDate,
      })),
    };
  }

  return { available: true };
}

export interface BlockedDateRange {
  /** First blocked day, inclusive. */
  from: Date;
  /** Last blocked day, inclusive (storage is [startDate, endDate) — checkout day is
   * not itself blocked, so this is one day before the stored exclusive `endDate`). */
  to: Date;
}

/** How far ahead the public listing page shows blocked dates. Bookings/blocks further
 * out than this still exist and are still enforced server-side — this only bounds what
 * gets serialized into the guest-facing calendar payload. Matches the horizon used for
 * date-price overrides (see pricing.service.ts getFutureDatePriceRowsForListing). */
const PUBLIC_AVAILABILITY_HORIZON_MONTHS = 18;

export async function getBlockedDateRangesForListing(
  listingId: string
): Promise<BlockedDateRange[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setMonth(horizon.getMonth() + PUBLIC_AVAILABILITY_HORIZON_MONTHS);

  const [listing, blocks] = await Promise.all([
    db.listing.findUnique({
      where: { id: listingId },
      select: {
        availabilityMode: true,
        availabilityWindows: {
          where: { startDate: { lt: horizon }, endDate: { gt: today } },
          select: { startDate: true, endDate: true },
          orderBy: { startDate: "asc" },
        },
      },
    }),
    db.availabilityBlock.findMany({
      where: {
        listingId,
        startDate: { lt: horizon },
        endDate: { gt: today },
      },
      select: { startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    }),
  ]);

  const result = blocks.map((block) => ({
    from: block.startDate < today ? today : block.startDate,
    to: block.endDate > horizon ? horizon : addDays(block.endDate, -1),
  }));

  if (listing?.availabilityMode !== "CLOSED") return result;

  // The guest calendar consumes blocked ranges, so complement explicit open windows
  // inside its bounded horizon. Booking enforcement above remains unbounded.
  let cursor = today;
  for (const window of listing.availabilityWindows) {
    const start = window.startDate < today ? today : window.startDate;
    const end = window.endDate > horizon ? horizon : window.endDate;
    if (start > cursor) result.push({ from: cursor, to: addDays(start, -1) });
    if (end > cursor) cursor = end;
  }
  if (cursor < horizon) result.push({ from: cursor, to: horizon });
  return result.sort((a, b) => a.from.getTime() - b.from.getTime());
}

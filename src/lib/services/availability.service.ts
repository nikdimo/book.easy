import "server-only";
import { db } from "@/lib/db";
import { addDays } from "date-fns";

export async function checkAvailability(
  listingId: string,
  checkIn: Date,
  checkOut: Date
): Promise<{ available: boolean; conflictingDates?: { start: Date; end: Date }[] }> {
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

  const blocks = await db.availabilityBlock.findMany({
    where: {
      listingId,
      startDate: { lt: horizon },
      endDate: { gt: today },
    },
    select: { startDate: true, endDate: true },
    orderBy: { startDate: "asc" },
  });

  return blocks.map((block) => ({
    from: block.startDate < today ? today : block.startDate,
    to: block.endDate > horizon ? horizon : addDays(block.endDate, -1),
  }));
}

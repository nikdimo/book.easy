import { db } from "@/lib/db";

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

export async function getBlockedDatesForListing(listingId: string): Promise<Date[]> {
  const blocks = await db.availabilityBlock.findMany({
    where: {
      listingId,
      endDate: { gte: new Date() },
    },
    select: { startDate: true, endDate: true },
  });

  const dates: Date[] = [];
  for (const block of blocks) {
    const current = new Date(block.startDate);
    const end = new Date(block.endDate);
    while (current < end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
  }

  return dates;
}

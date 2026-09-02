import "server-only";
import { db } from "@/lib/db";
import {
  addDaysToYmd,
  addMonthsToYmd,
  compareYmd,
  dbDateToYmd,
  todayYmd,
  ymdToDbDate,
} from "@/lib/utils/date-only";
import {
  mergeAvailabilityWindows,
  windowsOverlappingStay,
} from "@/lib/utils/availability-windows";
import { decideStayAvailability } from "@/lib/utils/stay-availability";

/**
 * Whether a listing can take this stay — the shared read behind every "is it free?"
 * question that is not the booking transaction itself.
 *
 * Two questions in order, and the order matters. First, does the listing *offer* these
 * dates at all: a flexible listing offers whatever its availability windows cover, and a
 * fixed-stay listing offers only the exact stays its host put on sale. That is answered
 * by `decideStayAvailability`, the same rule `createBooking` and the guest projection go
 * through, so this cannot drift from either. Second, is anything already holding those
 * nights — bookings, holds, manual blocks and imported calendar blocks alike, which is
 * one question in both modes and is unchanged.
 *
 * `fixedStayPeriodId` is additive: absent for every flexible listing, and the id of the
 * matched stay when there is one. Keeping it absent preserves the exact response shape
 * existing flexible callers received before fixed stays existed.
 */
export async function checkAvailability(
  listingId: string,
  checkIn: Date,
  checkOut: Date
): Promise<{
  available: boolean;
  conflictingDates?: { start: Date; end: Date }[];
  fixedStayPeriodId?: string | null;
}> {
  const checkInYmd = dbDateToYmd(checkIn);
  const checkOutYmd = dbDateToYmd(checkOut);
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: {
      bookingMode: true,
      availabilityMode: true,
      // Every window that touches the stay, not just one that spans it: the shared rule
      // merges them, so it has to see the neighbour a spanning-window query would drop.
      // Read only for a flexible listing — a fixed-stay one is sold by its stays, and its
      // windows are a stored-but-unread setting.
      availabilityWindows: {
        where: windowsOverlappingStay(checkIn, checkOut),
        select: { startDate: true, endDate: true },
      },
      // The one stay these exact dates could be, if this listing sells whole stays.
      // Scoped to the pair rather than loaded wholesale: the unique index means at most
      // one row can match, so this is a point read however long the host's season is.
      fixedStayPeriods: {
        where: { checkIn, checkOut },
        select: { id: true, checkIn: true, checkOut: true, disabledAt: true },
      },
    },
  });
  if (!listing) return { available: false };

  const decision = decideStayAvailability({
    bookingMode: listing.bookingMode,
    availabilityMode: listing.availabilityMode,
    windows: listing.availabilityWindows.map((window) => ({
      startDate: dbDateToYmd(window.startDate),
      endDate: dbDateToYmd(window.endDate),
    })),
    fixedStayPeriods: listing.fixedStayPeriods.map((period) => ({
      id: period.id,
      checkIn: dbDateToYmd(period.checkIn),
      checkOut: dbDateToYmd(period.checkOut),
      disabledAt: period.disabledAt,
    })),
    checkIn: checkInYmd,
    checkOut: checkOutYmd,
    today: todayYmd(),
  });
  if (!decision.offered) return { available: false };

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

  return decision.fixedStayPeriodId
    ? { available: true, fixedStayPeriodId: decision.fixedStayPeriodId }
    : { available: true };
}

/**
 * A run of unbookable days, as calendar dates rather than instants.
 *
 * `yyyy-MM-dd` on purpose. These cross the server/client boundary into the guest
 * calendar, and a `Date` crosses it as a *moment*: the UTC midnight the `@db.Date`
 * columns read back as is 19:00 the previous day in Chicago, so every blocked run
 * arrived a day early for guests west of UTC. A date-only string means the same day
 * on both sides, and the pickers turn it back into their own local midnight.
 */
export interface BlockedDateRange {
  /** First blocked day, inclusive. */
  from: string;
  /** Last blocked day, inclusive (storage is [startDate, endDate) — checkout day is
   * not itself blocked, so this is one day before the stored exclusive `endDate`). */
  to: string;
}

/** How far ahead the public listing page shows blocked dates. Bookings/blocks further
 * out than this still exist and are still enforced server-side — this only bounds what
 * gets serialized into the guest-facing calendar payload. Matches the horizon used for
 * date-price overrides (see pricing.service.ts getFutureDatePriceRowsForListing). */
export const PUBLIC_AVAILABILITY_HORIZON_MONTHS = 18;

export async function getBlockedDateRangesForListing(
  listingId: string
): Promise<BlockedDateRange[]> {
  const byListing = await getBlockedDateRangesForListings([listingId]);
  return byListing.get(listingId) ?? [];
}

/**
 * The same blocked ranges for many listings at once. A card grid needs availability for
 * every listing on the page, and the per-listing query would make that two round trips
 * per card.
 */
export async function getBlockedDateRangesForListings(
  listingIds: string[]
): Promise<Map<string, BlockedDateRange[]>> {
  const byListing = new Map<string, BlockedDateRange[]>();
  if (listingIds.length === 0) return byListing;

  // The marketplace's day, in the terms the `@db.Date` columns are stored in. The old
  // server-local midnight was an instant two hours off the UTC midnight Prisma reads
  // these columns back as, so on a UTC+2 host the window was skewed against every
  // comparison below and `addDays` walked local days over UTC anchors (M6).
  const today = todayYmd();
  const horizon = addMonthsToYmd(today, PUBLIC_AVAILABILITY_HORIZON_MONTHS);
  const todayDate = ymdToDbDate(today);
  const horizonDate = ymdToDbDate(horizon);

  const [listings, blocks] = await Promise.all([
    db.listing.findMany({
      where: { id: { in: listingIds } },
      select: {
        id: true,
        availabilityMode: true,
        availabilityWindows: {
          where: { startDate: { lt: horizonDate }, endDate: { gt: todayDate } },
          select: { startDate: true, endDate: true },
          orderBy: { startDate: "asc" },
        },
      },
    }),
    db.availabilityBlock.findMany({
      where: {
        listingId: { in: listingIds },
        startDate: { lt: horizonDate },
        endDate: { gt: todayDate },
      },
      select: { listingId: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    }),
  ]);

  for (const listing of listings) {
    const result = blocks
      .filter((block) => block.listingId === listing.id)
      .map((block) => {
        const start = dbDateToYmd(block.startDate);
        const endExclusive = dbDateToYmd(block.endDate);
        return {
          from: compareYmd(start, today) < 0 ? today : start,
          to:
            compareYmd(endExclusive, horizon) > 0
              ? horizon
              : addDaysToYmd(endExclusive, -1),
        };
      });

    if (listing.availabilityMode !== "CLOSED") {
      byListing.set(listing.id, result);
      continue;
    }

    // The guest calendar consumes blocked ranges, so complement explicit open windows
    // inside its bounded horizon. Booking enforcement above remains unbounded.
    //
    // Complementing the *merged* spans rather than the raw rows is what keeps this
    // calendar honest: it is the same merge `checkAvailability`, `createBooking` and
    // search now run, so a night this leaves selectable is a night the server accepts.
    // The old loop bridged touching windows too, but only as a side effect of carrying
    // `cursor` forward — and the three server paths did not bridge at all.
    let cursor = today;
    for (const span of mergeAvailabilityWindows(listing.availabilityWindows)) {
      const spanStart = dbDateToYmd(span.startDate);
      const spanEnd = dbDateToYmd(span.endDate);
      const start = compareYmd(spanStart, today) < 0 ? today : spanStart;
      const end = compareYmd(spanEnd, horizon) > 0 ? horizon : spanEnd;
      if (compareYmd(start, cursor) > 0) {
        result.push({ from: cursor, to: addDaysToYmd(start, -1) });
      }
      if (compareYmd(end, cursor) > 0) cursor = end;
    }
    if (compareYmd(cursor, horizon) < 0) result.push({ from: cursor, to: horizon });
    byListing.set(
      listing.id,
      result.sort((a, b) => compareYmd(a.from, b.from))
    );
  }

  return byListing;
}

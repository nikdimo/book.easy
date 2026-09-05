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
import { mergeAvailabilityWindows } from "@/lib/utils/availability-windows";

/**
 * What the guest calendar shows as unbookable.
 *
 * This module used to open with `checkAvailability`, documented as "the shared read
 * behind every 'is it free?' question" — and nothing in `src/app`, `src/components` or
 * the mobile API ever called it. (The similarly named
 * `/api/mobile/v1/listings/[id]/availability` is a host-authenticated *calendar
 * management* route behind `requireMobileHost`, not a guest "can I book these dates?"
 * endpoint.) It has been removed rather than left as a fourth implementation of a rule
 * three live paths already share: the public calendar and booking selection, the search
 * filter, and `createBooking`.
 *
 * The blocked-range reads below are live and stay. If a guest-facing availability
 * endpoint is ever built, it should call `decideStayAvailability` plus a block query —
 * the shape the deleted function had — and join the agreement suite.
 */

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

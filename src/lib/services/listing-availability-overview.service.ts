import "server-only";
import { db } from "@/lib/db";
import { platformFromFeedUrl } from "@/lib/host/v2/calendar-feed-platform";
import {
  summarizeListingAvailability,
  type ListingAvailabilityMode,
  type ListingAvailabilityOverview,
} from "@/lib/host/v2/availability-overview";
import { HOST_CALENDAR_HORIZON_MONTHS } from "@/lib/services/host-calendar-workspace.service";
import { dbDateToYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";

/**
 * The read behind the listing editor's Availability pane.
 *
 * A separate, narrower query from `getHostCalendarWorkspace` on purpose: that one loads
 * every listing the host owns with its prices, promotions and reservations because the
 * Calendar needs all of it at once, and this pane needs one listing's availability. It
 * reads the same rows the Calendar reads, so the two can never disagree about what is
 * blocked — it just stops well short of what the Calendar loads.
 *
 * Authorization is the query: the listing is reached through `hostId`, so one that is
 * not this host's comes back as `null` — "not found" — rather than leaking that it
 * exists. This grants nothing either way; it is a read, and the pane it feeds has no
 * mutation to authorize.
 *
 * The window is the guest-facing availability horizon rather than a shorter one of this
 * pane's own, matching the Calendar: a pane reporting "nothing blocked" while month
 * fourteen is closed would be a lie it told itself.
 */

function horizonEndYmd(today: string): string {
  const end = ymdToDbDate(today);
  end.setUTCMonth(end.getUTCMonth() + HOST_CALENDAR_HORIZON_MONTHS);
  return dbDateToYmd(end);
}

export async function getListingAvailabilityOverview(
  listingId: string,
  hostId: string,
): Promise<ListingAvailabilityOverview | null> {
  const today = todayYmd();
  const horizonEnd = horizonEndYmd(today);
  const todayDate = ymdToDbDate(today);
  const horizonDate = ymdToDbDate(horizonEnd);

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: {
      id: true,
      title: true,
      status: true,
      availabilityMode: true,
      // Anything still running today matters even if it started last week, so the
      // filter is on the exclusive end rather than on the start.
      availabilityBlocks: {
        where: { endDate: { gt: todayDate }, startDate: { lt: horizonDate } },
        orderBy: { startDate: "asc" },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          blockType: true,
          reason: true,
          // The URL is resolved to a channel below and never put in the payload: it
          // carries the private token that reads the host's real calendar.
          feed: { select: { name: true, url: true } },
        },
      },
      availabilityWindows: {
        where: { endDate: { gt: todayDate }, startDate: { lt: horizonDate } },
        orderBy: { startDate: "asc" },
        select: { id: true, startDate: true, endDate: true },
      },
      calendarFeeds: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          url: true,
          lastStatus: true,
          lastSyncedAt: true,
          lastBlockedNights: true,
        },
      },
    },
  });

  if (!listing) return null;

  return summarizeListingAvailability({
    listingId: listing.id,
    listingTitle: listing.title,
    status: listing.status,
    mode: listing.availabilityMode as ListingAvailabilityMode,
    today,
    horizonEnd,
    horizonMonths: HOST_CALENDAR_HORIZON_MONTHS,
    windows: listing.availabilityWindows.map((window) => ({
      id: window.id,
      startDate: dbDateToYmd(window.startDate),
      endDate: dbDateToYmd(window.endDate),
    })),
    blocks: listing.availabilityBlocks.map((block) => ({
      id: block.id,
      startDate: dbDateToYmd(block.startDate),
      endDate: dbDateToYmd(block.endDate),
      blockType: block.blockType,
      reason: block.reason,
      feedName: block.feed?.name ?? null,
      feedUrl: block.feed?.url ?? null,
    })),
    feeds: listing.calendarFeeds.map((feed) => ({
      id: feed.id,
      name: feed.name,
      url: feed.url,
      lastStatus: feed.lastStatus,
      lastSyncedAt: feed.lastSyncedAt?.toISOString() ?? null,
      lastBlockedNights: feed.lastBlockedNights,
    })),
    resolvePlatform: platformFromFeedUrl,
  });
}

/**
 * What a listing's availability *is* right now, as a short read-only summary.
 *
 * The Calendar is the only place availability is changed, and this module exists so the
 * listing editor can say what the current answer is without growing a second editor for
 * it. Nothing here mutates anything and nothing here decides what the host may do — it
 * reads rows the Calendar already owns and reduces them to the few lines a host needs
 * before deciding whether to open Calendar at all.
 *
 * The shaping is kept apart from the query so it can be reasoned about — and tested —
 * without a database: the service hands it civil `YYYY-MM-DD` strings, exactly the
 * convention the rest of the calendar code normalizes to, and receives a payload whose
 * dates are still strings for the same reason (a `Date` would be re-read against the
 * renderer's own midnight rather than the marketplace's).
 *
 * Ranges arrive in the storage convention used everywhere else here: `startDate` is the
 * first covered day and `endDate` is the exclusive checkout boundary. Because a host
 * reads "blocked 3–7 March", not "3 March up to but not including 8", every period also
 * carries the inclusive `lastDate` that should actually be shown.
 */

import type { CalendarPlatform } from "@/lib/host/v2/calendar-feed-platform";
import {
  listingVisibility,
  type HostListingVisibility,
} from "@/lib/host/v2/listing-status";
import { addDaysToYmd, compareYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  hostCalendarHref,
  type CalendarIntent,
} from "@/lib/host/v2/calendar-href";

export type ListingAvailabilityMode = "OPEN" | "CLOSED";

/** Whether a connected calendar's last sync worked, mirroring `CalendarFeedStatus`. */
export type CalendarFeedHealth = "OK" | "ERROR" | "PENDING";

/** How many rows of a kind are listed before the pane defers to Calendar. A summary
 *  that lists forty blocked ranges has stopped being a summary. */
export const AVAILABILITY_PREVIEW_LIMIT = 4;

export interface AvailabilityPeriod {
  id: string;
  /** Inclusive first covered date. */
  startDate: string;
  /** Exclusive end, as stored. */
  endDate: string;
  /** Inclusive last covered date — what the host is shown. */
  lastDate: string;
  nights: number;
  /** True while the period has not begun yet, which is what makes it *scheduled*. */
  scheduled: boolean;
}

export interface AvailabilityBlockPeriod extends AvailabilityPeriod {
  /** `EXTERNAL` blocks are held by a connected calendar and are not the host's to
   *  remove date by date — the feed owns them until it is disconnected. */
  source: "MANUAL" | "EXTERNAL";
  reason: string | null;
  /** The host's own label for the feed that placed it, shown verbatim. */
  feedName: string | null;
  /** Resolved from the feed URL on the server; the URL itself never travels onward. */
  feedPlatform: CalendarPlatform | null;
}

export interface ConnectedCalendarSummary {
  id: string;
  name: string;
  platform: CalendarPlatform | null;
  health: CalendarFeedHealth;
  /** ISO instant, or null when the feed has never completed a sync. */
  lastSyncedAt: string | null;
  lastBlockedNights: number;
}

export interface ListingAvailabilityOverview {
  listingId: string;
  listingTitle: string;
  /** Raw `Listing.status`, so callers resolve their own status label. */
  status: string;
  visibility: HostListingVisibility;
  mode: ListingAvailabilityMode;
  today: string;
  horizonEnd: string;
  horizonMonths: number;
  /** Only meaningful in `CLOSED` mode, where they are the *only* bookable dates. */
  openWindows: AvailabilityPeriod[];
  openWindowCount: number;
  blockedPeriods: AvailabilityBlockPeriod[];
  blockedPeriodCount: number;
  calendars: ConnectedCalendarSummary[];
  calendarsFailing: number;
  /** Periods that have not started yet — decisions already taken for later dates. */
  scheduledCount: number;
}

export interface AvailabilityOverviewInput {
  listingId: string;
  listingTitle: string;
  status: string;
  mode: ListingAvailabilityMode;
  today: string;
  horizonEnd: string;
  horizonMonths: number;
  windows: Array<{ id: string; startDate: string; endDate: string }>;
  blocks: Array<{
    id: string;
    startDate: string;
    endDate: string;
    blockType: string;
    reason: string | null;
    feedName: string | null;
    feedUrl: string | null;
  }>;
  feeds: Array<{
    id: string;
    name: string;
    url: string | null;
    lastStatus: string;
    lastSyncedAt: string | null;
    lastBlockedNights: number;
  }>;
  /** Injected so this module does not import a second copy of the channel-resolution
   *  rule, and so a test can prove the URL is only ever read through it. */
  resolvePlatform: (url: string | null) => CalendarPlatform | null;
}

const DAY_MS = 86_400_000;

function nightsBetween(startDate: string, endDate: string): number {
  return Math.round(
    (ymdToDbDate(endDate).getTime() - ymdToDbDate(startDate).getTime()) / DAY_MS,
  );
}

function toPeriod(
  row: { id: string; startDate: string; endDate: string },
  today: string,
): AvailabilityPeriod {
  return {
    id: row.id,
    startDate: row.startDate,
    endDate: row.endDate,
    // A one-night range ends the morning after it starts, so its last covered date is
    // the day it began — never `endDate`, which already belongs to the next guest.
    lastDate: addDaysToYmd(row.endDate, -1),
    nights: nightsBetween(row.startDate, row.endDate),
    scheduled: compareYmd(row.startDate, today) > 0,
  };
}

function feedHealth(lastStatus: string): CalendarFeedHealth {
  return lastStatus === "OK" || lastStatus === "ERROR" ? lastStatus : "PENDING";
}

/**
 * Reduces the rows the Calendar already loads into the handful of facts this pane shows.
 *
 * Reservation holds are deliberately not "blocked periods". A confirmed stay is a
 * booking, not a decision the host took about availability, and reporting it here would
 * both duplicate Reservations and imply the host could take those nights back from a
 * screen that changes nothing.
 */
export function summarizeListingAvailability(
  input: AvailabilityOverviewInput,
): ListingAvailabilityOverview {
  const openWindows = input.windows
    .map((window) => toPeriod(window, input.today))
    .sort((left, right) => compareYmd(left.startDate, right.startDate));

  const blockedPeriods: AvailabilityBlockPeriod[] = input.blocks
    .filter(
      (block) =>
        block.blockType === "MANUAL_BLOCK" || block.blockType === "EXTERNAL_SYNC",
    )
    .map((block): AvailabilityBlockPeriod => ({
      ...toPeriod(block, input.today),
      source: block.blockType === "EXTERNAL_SYNC" ? "EXTERNAL" : "MANUAL",
      reason: block.reason,
      feedName: block.feedName,
      feedPlatform: input.resolvePlatform(block.feedUrl),
    }))
    .sort((left, right) => compareYmd(left.startDate, right.startDate));

  const calendars: ConnectedCalendarSummary[] = input.feeds.map((feed) => ({
    id: feed.id,
    name: feed.name,
    platform: input.resolvePlatform(feed.url),
    health: feedHealth(feed.lastStatus),
    lastSyncedAt: feed.lastSyncedAt,
    lastBlockedNights: feed.lastBlockedNights,
  }));

  const scheduledCount =
    openWindows.filter((window) => window.scheduled).length +
    blockedPeriods.filter((period) => period.scheduled).length;

  return {
    listingId: input.listingId,
    listingTitle: input.listingTitle,
    status: input.status,
    visibility: listingVisibility(input.status),
    mode: input.mode,
    today: input.today,
    horizonEnd: input.horizonEnd,
    horizonMonths: input.horizonMonths,
    openWindows: openWindows.slice(0, AVAILABILITY_PREVIEW_LIMIT),
    openWindowCount: openWindows.length,
    blockedPeriods: blockedPeriods.slice(0, AVAILABILITY_PREVIEW_LIMIT),
    blockedPeriodCount: blockedPeriods.length,
    calendars,
    calendarsFailing: calendars.filter((calendar) => calendar.health === "ERROR").length,
    scheduledCount,
  };
}

/**
 * Where date-specific availability is changed.
 *
 * A named alias for this pane rather than a second implementation: `hostCalendarHref`
 * is the single source of the path and the parameters, so the pane's link and the
 * calendar page that reads it cannot drift. The intent travels with it, so following
 * the link lands on a calendar that is asking which dates to open or block rather than
 * on a menu that has forgotten what the host came for.
 */
export function calendarHrefForListing(
  listingId: string,
  intent?: CalendarIntent | null,
): string {
  return hostCalendarHref(listingId, { intent });
}

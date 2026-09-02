import "server-only";

import { randomBytes } from "node:crypto";
import { BlockType, CalendarFeedStatus, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildIcs, parseIcs, type IcsExportEvent } from "@/lib/calendar-sync/ics";
import { communicationAppUrl } from "@/lib/communication-brand.server";
import {
  addDaysToYmd,
  compareYmd,
  dbDateToYmd,
  eachYmdExclusive,
  todayYmd,
  ymdToDbDate,
} from "@/lib/utils/date-only";
import { assertPublicHttpsUrl } from "@/lib/utils/public-url";

/**
 * How far ahead a calendar is published and mirrored.
 *
 * Channels poll this feed, they don't archive it, so the past is worthless to them and
 * omitting it keeps the document small. Two years forward covers every booking window
 * the marketplace supports and bounds the "closed by default" expansion below, which
 * would otherwise be infinite.
 */
const HORIZON_DAYS = 730;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
/** Feeds per listing. Airbnb, Booking.com, Vrbo and a spare is a generous ceiling, and
 *  it bounds the work a single listing can ask the sync job to do. */
export const MAX_FEEDS_PER_LISTING = 6;

export function generateCalendarFeedToken(): string {
  return randomBytes(24).toString("base64url");
}

export function calendarFeedUrl(token: string): string {
  return communicationAppUrl(`/api/calendar/${token}.ics`);
}

/**
 * The listing's export token, minted on first use.
 *
 * Lazy rather than a default on the column so a listing that never syncs publishes no
 * feed at all — there is no URL to guess, correctly or otherwise.
 */
export async function ensureCalendarFeedToken(listingId: string): Promise<string> {
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { calendarFeedToken: true },
  });
  if (listing?.calendarFeedToken) return listing.calendarFeedToken;

  const token = generateCalendarFeedToken();
  await db.listing.update({
    where: { id: listingId },
    data: { calendarFeedToken: token },
  });
  return token;
}

export async function rotateCalendarFeedToken(listingId: string): Promise<string> {
  const token = generateCalendarFeedToken();
  await db.listing.update({
    where: { id: listingId },
    data: { calendarFeedToken: token },
  });
  return token;
}

/** Contiguous nights, coalesced into the fewest possible [start, end) ranges. */
function coalesce(nights: Iterable<string>): { startYmd: string; endYmd: string }[] {
  const sorted = [...new Set(nights)].sort(compareYmd);
  const ranges: { startYmd: string; endYmd: string }[] = [];
  for (const night of sorted) {
    const last = ranges.at(-1);
    if (last && last.endYmd === night) {
      last.endYmd = addDaysToYmd(night, 1);
    } else {
      ranges.push({ startYmd: night, endYmd: addDaysToYmd(night, 1) });
    }
  }
  return ranges;
}

/**
 * The nights *not* in `open`, as the fewest events that can say so.
 *
 * Both closed-by-default modes end here. A listing that publishes no block row for the
 * dates it simply never opened has to publish their complement instead, or the receiving
 * channel reads the whole horizon as bookable and sells a night nobody offered.
 *
 * The UID is the dates, because there is no row to key on — the ranges are derived. It is
 * deterministic, so a channel polling an unchanged calendar updates the same events
 * rather than accumulating duplicates of them.
 */
function closedRangeEvents(
  open: ReadonlySet<string>,
  from: string,
  to: string,
  listingId: string,
): IcsExportEvent[] {
  const closed: string[] = [];
  for (const night of eachYmdExclusive(from, to)) {
    if (!open.has(night)) closed.push(night);
  }
  return coalesce(closed).map((range) => ({
    uid: `closed-${range.startYmd}-${range.endYmd}-${listingId}@lingerhomes.com`,
    startYmd: range.startYmd,
    endYmd: range.endYmd,
    summary: "Not available",
  }));
}

/**
 * Everything that makes a night unbookable, as an export calendar.
 *
 * Blocks mirrored in *from* another channel are included rather than filtered out. It
 * looks like an echo — Airbnb hearing its own reservation back — but a host with three
 * channels connected only gets Airbnb's bookings onto Booking.com by way of us, and a
 * platform re-reading nights it already holds is a no-op. Suppressing the echo would
 * quietly break exactly the cross-channel case this feature exists for.
 *
 * ── What a fixed-stay listing can and cannot tell a channel ──────────────────────
 *
 * A FIXED_STAYS listing sells whole stays: an exact check-in and checkout the host put
 * on sale, 7 or 14 nights, take it or take another. This feed publishes the *nights*
 * those stays cover and closes every other night in the horizon, which is the strongest
 * statement iCalendar can make — and it is genuinely useful, because it stops another
 * channel selling the weeks between two offered stays.
 *
 * **It cannot express the rule itself.** iCalendar has no vocabulary for "arrivals on
 * Saturdays only" or "exactly 7 or 14 nights". A channel reading this feed sees a run of
 * open nights and will happily sell nights 3 to 6 of an offered week, or join two
 * back-to-back weeks into a ten-night stay. Nothing in this document prevents that, and
 * nothing added to this document could.
 *
 * The consequence is a host instruction, not a code change: a host syncing a fixed-stay
 * listing to Airbnb, Booking.com or Vrbo must set that channel's own changeover-day and
 * minimum/maximum-stay rules to match the stays they offer here. Where the channel has
 * no such rule, the feed is advisory and the host is accepting bookings this listing's
 * own booking transaction would refuse — `createBooking` still enforces the exact match,
 * so the risk is a double-sold night on the channel's side, never a wrong booking here.
 */
export async function buildListingCalendar(token: string): Promise<{ body: string; listingId: string } | null> {
  const listing = await db.listing.findUnique({
    where: { calendarFeedToken: token },
    select: {
      id: true,
      title: true,
      availabilityMode: true,
      bookingMode: true,
    },
  });
  if (!listing) return null;

  const from = todayYmd();
  const to = addDaysToYmd(from, HORIZON_DAYS);
  // Which question this listing's open nights are the answer to. A fixed-stay listing is
  // not governed by `availabilityMode` at all — its windows are a stored, unread setting
  // left over from however it sold before — so the two branches are exclusive, and each
  // loads only the rows it will read.
  const sellsFixedStays = listing.bookingMode === "FIXED_STAYS";
  const closedByDefault = !sellsFixedStays && listing.availabilityMode === "CLOSED";

  const [blocks, windows, fixedStayPeriods] = await Promise.all([
    db.availabilityBlock.findMany({
      where: {
        listingId: listing.id,
        endDate: { gt: ymdToDbDate(from) },
        startDate: { lt: ymdToDbDate(to) },
      },
      select: { id: true, startDate: true, endDate: true, blockType: true },
      orderBy: { startDate: "asc" },
    }),
    closedByDefault
      ? db.listingAvailabilityWindow.findMany({
          where: {
            listingId: listing.id,
            endDate: { gt: ymdToDbDate(from) },
            startDate: { lt: ymdToDbDate(to) },
          },
          select: { startDate: true, endDate: true },
          orderBy: { startDate: "asc" },
        })
      : Promise.resolve([]),
    // Every stay that could open a night inside the horizon, in one query.
    //
    // Narrowed in SQL rather than in memory, and by the same three rules the guest
    // projection applies: switched-off stays open nothing, a stay whose check-in has
    // already gone by is not on sale however long it runs, and a stay beginning past the
    // horizon has no night in this document. What the range filter does not do is clip —
    // a stay running past the horizon keeps its row here and loses its outlying nights to
    // the expansion below, which never leaves `[from, to)`.
    sellsFixedStays
      ? db.listingFixedStayPeriod.findMany({
          where: {
            listingId: listing.id,
            disabledAt: null,
            checkIn: { gte: ymdToDbDate(from), lt: ymdToDbDate(to) },
          },
          select: { checkIn: true, checkOut: true },
          orderBy: { checkIn: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const events: IcsExportEvent[] = blocks.map((block) => {
    const startYmd = dbDateToYmd(block.startDate);
    const endYmd = dbDateToYmd(block.endDate);
    return {
      // Stable across polls, so a subscriber updates one event rather than piling up
      // duplicates. Block ids survive edits to unrelated dates.
      uid: `block-${block.id}@lingerhomes.com`,
      startYmd: compareYmd(startYmd, from) < 0 ? from : startYmd,
      endYmd,
      // Deliberately anonymous. The receiving platform needs "taken", not who by.
      summary:
        block.blockType === BlockType.BOOKING_HOLD ? "Reserved" : "Not available",
    };
  });

  // Both closed-by-default modes publish the complement of whatever they *do* open. Only
  // the definition of "open" differs, and only one of these branches can run.
  if (sellsFixedStays) {
    // The union of the stays on sale — union, so two stays sharing nights count them
    // once and two back-to-back stays run together into one open stretch. Membership is
    // per night in a set, which is what makes overlapping and adjacent stays fall out
    // correctly without any interval arithmetic.
    //
    // A stay reaching past the horizon contributes only the nights inside it; a stay
    // beginning past the horizon was never loaded. Everything else in the two years is
    // closed — including the gaps before the first stay, between stays and after the
    // last, which is precisely what stops a channel selling the weeks the host kept.
    const open = new Set<string>();
    for (const period of fixedStayPeriods) {
      for (const night of eachYmdExclusive(
        dbDateToYmd(period.checkIn),
        dbDateToYmd(period.checkOut),
      )) {
        if (compareYmd(night, from) >= 0 && compareYmd(night, to) < 0) {
          open.add(night);
        }
      }
    }
    // With no stays on sale the union is empty and the whole horizon closes, which is
    // the honest statement: this listing currently offers nothing.
    events.push(...closedRangeEvents(open, from, to, listing.id));
  } else if (closedByDefault) {
    // A CLOSED listing has no block rows for the dates it simply never opened, so the
    // complement of its open windows has to be published or the other channel would read
    // the whole horizon as bookable.
    const open = new Set<string>();
    for (const window of windows) {
      for (const night of eachYmdExclusive(
        dbDateToYmd(window.startDate),
        dbDateToYmd(window.endDate),
      )) {
        open.add(night);
      }
    }
    events.push(...closedRangeEvents(open, from, to, listing.id));
  }

  return {
    listingId: listing.id,
    body: buildIcs({ calendarName: listing.title, events }),
  };
}

export interface FeedSyncResult {
  feedId: string;
  ok: boolean;
  /** VEVENTs the remote calendar contained, after filtering to our horizon. */
  events: number;
  /** Nights this feed now holds — lower than the event span when other blocks or
   *  reservations already covered part of it. */
  blockedNights: number;
  error?: string;
}

async function fetchFeedBody(url: string): Promise<string> {
  let target = await assertPublicHttpsUrl(url, {
    protocol: "A calendar link must be a public HTTPS URL.",
    privateHost: "That calendar link points at a private address.",
    unresolvable: "That calendar link does not resolve to a public server.",
  });

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(target, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "text/calendar,text/plain;q=0.9,*/*;q=0.5",
        "User-Agent": "LingerHomes-CalendarSync/1.0",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The calendar link returned an invalid redirect.");
      // Re-validated on every hop: the first URL being public says nothing about where
      // it sends us next.
      target = await assertPublicHttpsUrl(new URL(location, target).href, {
        protocol: "That calendar link redirects to a non-HTTPS address.",
        privateHost: "That calendar link redirects to a private address.",
        unresolvable: "That calendar link redirects somewhere unreachable.",
      });
      continue;
    }

    if (!response.ok) {
      throw new Error(`The calendar could not be downloaded (HTTP ${response.status}).`);
    }

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) {
      throw new Error("That calendar is too large to import.");
    }

    const body = await response.text();
    if (body.length > MAX_FEED_BYTES) {
      throw new Error("That calendar is too large to import.");
    }
    if (!body.includes("BEGIN:VCALENDAR")) {
      throw new Error("That link did not return a calendar file.");
    }
    return body;
  }

  throw new Error("The calendar link redirected too many times.");
}

/**
 * Pull one remote calendar and mirror it onto the listing.
 *
 * Replace-in-full rather than diff: the feed's own blocks are deleted and rebuilt from
 * what the remote calendar says right now, so a cancellation upstream frees the night
 * here without needing to be recognised as a cancellation. Only rows carrying this
 * feed's id are touched — a host's manual blocks and real reservations are invisible to
 * it, which is what keeps a misbehaving channel from opening dates it never owned.
 */
export async function syncCalendarFeed(feedId: string): Promise<FeedSyncResult> {
  const feed = await db.listingCalendarFeed.findUnique({
    where: { id: feedId },
    select: { id: true, listingId: true, url: true },
  });
  if (!feed) return { feedId, ok: false, events: 0, blockedNights: 0, error: "Feed not found." };

  let body: string;
  try {
    body = await fetchFeedBody(feed.url);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "The calendar took too long to respond."
        : error instanceof Error
          ? error.message
          : "The calendar could not be downloaded.";
    await db.listingCalendarFeed.update({
      where: { id: feed.id },
      data: {
        lastStatus: CalendarFeedStatus.ERROR,
        lastError: message.slice(0, 500),
        lastSyncedAt: new Date(),
      },
    });
    return { feedId, ok: false, events: 0, blockedNights: 0, error: message };
  }

  const from = todayYmd();
  const to = addDaysToYmd(from, HORIZON_DAYS);

  // Past nights are dropped: they cannot be booked here, and importing them would fight
  // the "endDate >= today" queries the rest of the calendar is built on.
  const wanted = new Set<string>();
  let events = 0;
  for (const event of parseIcs(body)) {
    const start = compareYmd(event.startYmd, from) < 0 ? from : event.startYmd;
    const end = compareYmd(event.endYmd, to) > 0 ? to : event.endYmd;
    if (compareYmd(end, start) <= 0) continue;
    events += 1;
    for (const night of eachYmdExclusive(start, end)) wanted.add(night);
  }

  let blockedNights = 0;
  await db.$transaction(async (tx) => {
    // Same key blockDates and createBooking take, so a mirror pass and a guest checking
    // out cannot both pass their overlap check at once.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${feed.listingId}))`;

    await tx.availabilityBlock.deleteMany({ where: { feedId: feed.id } });

    const occupied = await tx.availabilityBlock.findMany({
      where: {
        listingId: feed.listingId,
        endDate: { gt: ymdToDbDate(from) },
        startDate: { lt: ymdToDbDate(to) },
      },
      select: { startDate: true, endDate: true },
    });
    for (const block of occupied) {
      for (const night of eachYmdExclusive(
        dbDateToYmd(block.startDate),
        dbDateToYmd(block.endDate),
      )) {
        wanted.delete(night);
      }
    }

    const ranges = coalesce(wanted);
    if (ranges.length > 0) {
      await tx.availabilityBlock.createMany({
        data: ranges.map((range) => ({
          listingId: feed.listingId,
          startDate: ymdToDbDate(range.startYmd),
          endDate: ymdToDbDate(range.endYmd),
          blockType: BlockType.EXTERNAL_SYNC,
          feedId: feed.id,
          reason: "Imported from a connected calendar",
        })) satisfies Prisma.AvailabilityBlockCreateManyInput[],
      });
    }
    blockedNights = wanted.size;

    await tx.listingCalendarFeed.update({
      where: { id: feed.id },
      data: {
        lastStatus: CalendarFeedStatus.OK,
        lastError: null,
        lastSyncedAt: new Date(),
        lastEventCount: events,
        lastBlockedNights: blockedNights,
      },
    });
  });

  // No cache revalidation here on purpose: this runs from the scheduled script as well
  // as from a server action, and revalidatePath is only legal inside a request. The
  // action wrapper does it; the cron run relies on the calendar's own revalidation
  // window, which is minutes, not hours.
  return { feedId: feed.id, ok: true, events, blockedNights };
}

/**
 * Mirror every connected calendar. Failures are recorded per feed and never abort the
 * run, so one dead URL does not stop the other hosts' calendars from updating.
 */
export async function syncAllCalendarFeeds(): Promise<FeedSyncResult[]> {
  const feeds = await db.listingCalendarFeed.findMany({
    select: { id: true },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
  });

  const results: FeedSyncResult[] = [];
  for (const feed of feeds) {
    try {
      results.push(await syncCalendarFeed(feed.id));
    } catch (error) {
      results.push({
        feedId: feed.id,
        ok: false,
        events: 0,
        blockedNights: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  return results;
}

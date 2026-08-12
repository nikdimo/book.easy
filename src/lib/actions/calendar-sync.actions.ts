"use server";

import { revalidatePath } from "next/cache";
import { CalendarFeedStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  calendarFeedUrl,
  ensureCalendarFeedToken,
  MAX_FEEDS_PER_LISTING,
  rotateCalendarFeedToken,
  syncCalendarFeed,
} from "@/lib/calendar-sync/service";

export interface CalendarFeedView {
  id: string;
  name: string;
  url: string;
  lastSyncedAt: string | null;
  lastStatus: CalendarFeedStatus;
  lastError: string | null;
  lastEventCount: number;
  lastBlockedNights: number;
}

export interface CalendarConnectionsView {
  exportUrl: string;
  feeds: CalendarFeedView[];
}

/** Hosts manage their own listings; admins manage anyone's — the same rule the rest of
 *  the calendar actions follow (see availability.actions.ts). */
async function requireManagedListing(
  listingId: string,
): Promise<{ error: string } | { listing: { id: string; hostId: string } }> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" as const };
  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, hostId: true },
  });
  if (!listing) return { error: "Listing not found" as const };
  if (session.user.role !== "ADMIN" && listing.hostId !== session.user.id) {
    return { error: "Listing not found" as const };
  }
  return { listing };
}

function view(feed: {
  id: string;
  name: string;
  url: string;
  lastSyncedAt: Date | null;
  lastStatus: CalendarFeedStatus;
  lastError: string | null;
  lastEventCount: number;
  lastBlockedNights: number;
}): CalendarFeedView {
  return {
    id: feed.id,
    name: feed.name,
    url: feed.url,
    lastSyncedAt: feed.lastSyncedAt?.toISOString() ?? null,
    lastStatus: feed.lastStatus,
    lastError: feed.lastError,
    lastEventCount: feed.lastEventCount,
    lastBlockedNights: feed.lastBlockedNights,
  };
}

const FEED_SELECT = {
  id: true,
  name: true,
  url: true,
  lastSyncedAt: true,
  lastStatus: true,
  lastError: true,
  lastEventCount: true,
  lastBlockedNights: true,
} as const;

async function connectionsFor(listingId: string): Promise<CalendarConnectionsView> {
  const [token, feeds] = await Promise.all([
    ensureCalendarFeedToken(listingId),
    db.listingCalendarFeed.findMany({
      where: { listingId },
      select: FEED_SELECT,
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return { exportUrl: calendarFeedUrl(token), feeds: feeds.map(view) };
}

function revalidateCalendar(listingId: string) {
  revalidatePath(`/host/listings/${listingId}/availability`);
  revalidatePath(`/host/listings/${listingId}/pricing`);
}

/**
 * Read the panel's state, minting the export token on the way.
 *
 * Deliberately the same call that creates the token: opening the panel is the moment a
 * host first has somewhere to paste it, and a token nobody has seen is not a secret
 * worth protecting from its own owner.
 */
export async function getCalendarConnections(
  listingId: string,
): Promise<{ error: string } | CalendarConnectionsView> {
  const managed = await requireManagedListing(listingId);
  if ("error" in managed) return { error: managed.error };
  return connectionsFor(listingId);
}

export async function regenerateCalendarExportToken(
  listingId: string,
): Promise<{ error: string } | { success: string; exportUrl: string }> {
  const managed = await requireManagedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const token = await rotateCalendarFeedToken(listingId);
  revalidateCalendar(listingId);
  return {
    success:
      "New link created. Paste it into every platform you had connected — the old link has stopped working.",
    exportUrl: calendarFeedUrl(token),
  };
}

export async function addCalendarFeed(
  listingId: string,
  input: { name: string; url: string },
): Promise<{ error: string } | { success: string; connections: CalendarConnectionsView }> {
  const managed = await requireManagedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const name = input.name.trim().slice(0, 60) || "Connected calendar";
  const url = input.url.trim();

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: "Paste the full calendar link, starting with https://" };
  }
  if (parsed.protocol !== "https:") {
    return { error: "A calendar link must start with https://" };
  }
  // Deliberately not requiring a .ics suffix: plenty of platforms serve a calendar from
  // a query string. The fetch checks the body actually is one.

  const existing = await db.listingCalendarFeed.count({ where: { listingId } });
  if (existing >= MAX_FEEDS_PER_LISTING) {
    return { error: `You can connect up to ${MAX_FEEDS_PER_LISTING} calendars to one listing.` };
  }

  const duplicate = await db.listingCalendarFeed.findFirst({
    where: { listingId, url: parsed.href },
    select: { id: true },
  });
  if (duplicate) return { error: "That calendar is already connected." };

  const feed = await db.listingCalendarFeed.create({
    data: { listingId, name, url: parsed.href },
    select: { id: true },
  });

  // Sync immediately: a host who just pasted a link is standing there waiting to see
  // whether it worked, and a wrong link should fail now rather than an hour from now.
  const result = await syncCalendarFeed(feed.id);
  revalidateCalendar(listingId);
  const connections = await connectionsFor(listingId);

  if (!result.ok) {
    return {
      success:
        result.error ??
        "Calendar connected, but it could not be read yet. It will be retried automatically.",
      connections,
    };
  }
  return {
    success: `Calendar connected — ${result.blockedNights} ${
      result.blockedNights === 1 ? "night" : "nights"
    } blocked from ${result.events} ${result.events === 1 ? "reservation" : "reservations"}.`,
    connections,
  };
}

export async function refreshCalendarFeed(
  listingId: string,
  feedId: string,
): Promise<{ error: string } | { success: string; connections: CalendarConnectionsView }> {
  const managed = await requireManagedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const feed = await db.listingCalendarFeed.findFirst({
    where: { id: feedId, listingId },
    select: { id: true },
  });
  if (!feed) return { error: "That calendar is not connected to this listing." };

  const result = await syncCalendarFeed(feed.id);
  revalidateCalendar(listingId);
  const connections = await connectionsFor(listingId);

  return {
    success: result.ok
      ? `Updated — ${result.blockedNights} ${
          result.blockedNights === 1 ? "night" : "nights"
        } blocked.`
      : (result.error ?? "That calendar could not be read."),
    connections,
  };
}

/**
 * Disconnect a calendar. The blocks it created cascade away with it, freeing every date
 * it was holding — which is the whole point: a host who removes Airbnb expects those
 * dates back, and leaving orphaned blocks behind would strand them unbookable with no
 * row in the UI to explain why.
 */
export async function removeCalendarFeed(
  listingId: string,
  feedId: string,
): Promise<{ error: string } | { success: string; connections: CalendarConnectionsView }> {
  const managed = await requireManagedListing(listingId);
  if ("error" in managed) return { error: managed.error };

  const feed = await db.listingCalendarFeed.findFirst({
    where: { id: feedId, listingId },
    select: { id: true },
  });
  if (!feed) return { error: "That calendar is not connected to this listing." };

  await db.listingCalendarFeed.delete({ where: { id: feed.id } });
  revalidateCalendar(listingId);

  return {
    success: "Calendar disconnected. The dates it was holding are open again.",
    connections: await connectionsFor(listingId),
  };
}

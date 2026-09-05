import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { BookingStatus, ListingStatus } from "@prisma/client";
import {
  computePopularityScore,
  POPULARITY_WINDOW_DAYS,
  type DailyCount,
} from "@/lib/utils/popularity-score";

/** Bookings still alive or honoured — the strong signal. */
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.CONFIRMED,
  BookingStatus.COMPLETED,
];

/** Rows are written and updated in batches this size so a site with thousands of
 *  listings doesn't build one enormous transaction. */
const WRITE_CHUNK_SIZE = 200;

/** Midnight UTC for the day `at` falls on. Views are stored as a `@db.Date`, and using
 *  UTC consistently keeps the per-visitor-per-day dedupe from double-counting around a
 *  local midnight or a DST change. */
export function startOfUtcDay(at: Date = new Date()): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/**
 * A stable but non-identifying handle for "the same visitor, today". IP and user agent
 * are hashed together with a server-side secret and the day itself, so the stored value
 * can't be reversed into an IP, and can't be correlated across days. Anonymous visitors
 * are the majority of traffic here, so there's no user id to use instead.
 */
export function buildVisitorKey(ip: string, userAgent: string, day: Date): string {
  const pepper = process.env.AUTH_SECRET ?? "book-easy-popularity";
  return createHash("sha256")
    .update(`${ip}|${userAgent}|${day.toISOString().slice(0, 10)}|${pepper}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Records that a visitor looked at a listing. Idempotent per visitor per day thanks to
 * the unique constraint on ListingView — repeat views are silently ignored rather than
 * erroring. Returns whether this was the visitor's first view of the listing today.
 */
export async function recordListingView(
  listingId: string,
  visitorKey: string,
  at: Date = new Date()
): Promise<boolean> {
  const result = await db.listingView.createMany({
    data: [{ listingId, visitorKey, viewedOn: startOfUtcDay(at) }],
    skipDuplicates: true,
  });
  return result.count > 0;
}

function addDaily(map: Map<string, DailyCount[]>, listingId: string, day: Date, count: number) {
  const existing = map.get(listingId);
  if (existing) existing.push({ day, count });
  else map.set(listingId, [{ day, count }]);
}

export interface PopularityRecomputeResult {
  listingsScored: number;
  listingsUpdated: number;
  /** Listings that left APPROVED and had a score left over from when they had not. */
  listingsCleared: number;
  viewsPruned: number;
}

/**
 * The columns that say "this listing has no popularity", written as the absence they are.
 *
 * A score is a statement about a listing people can currently see. Scoring only APPROVED
 * listings was right; leaving the *last* score behind on the ones that dropped out was
 * not. Harmless while search filters them away — and then not harmless at all the moment
 * one is republished, because it comes back ranked on a months-old number that describes
 * a different market and no traffic anyone can point at.
 *
 * Zero and null rather than a stale figure with a fresh timestamp: `popularityUpdatedAt`
 * means "when this score was measured", and there is no measurement to date.
 */
export const NO_POPULARITY = {
  popularityScore: 0,
  popularityUpdatedAt: null,
} as const;

/**
 * Recomputes `Listing.popularityScore` for every publicly visible listing from the last
 * POPULARITY_WINDOW_DAYS of activity, then prunes view rows that have aged out.
 *
 * Meant to be run on a schedule (see scripts/recompute-popularity.ts) rather than per
 * request: the scores only need to be roughly current, and doing it in the background
 * keeps the home page down to a single indexed ORDER BY.
 */
export async function recomputePopularityScores(
  now: Date = new Date()
): Promise<PopularityRecomputeResult> {
  const cutoff = new Date(now.getTime() - POPULARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const cutoffDay = startOfUtcDay(cutoff);

  const [listings, staleListings, viewGroups, bookings] = await Promise.all([
    db.listing.findMany({
      where: { status: ListingStatus.APPROVED },
      select: { id: true, popularityScore: true },
    }),
    // Listings that are no longer publicly visible but still carry a score from when
    // they were. The lifecycle writers clear this at the moment of the transition; this
    // is the sweep that catches everything already in that state, and anything that
    // leaves APPROVED by some other route.
    db.listing.findMany({
      where: {
        status: { not: ListingStatus.APPROVED },
        OR: [{ popularityScore: { not: 0 } }, { popularityUpdatedAt: { not: null } }],
      },
      select: { id: true },
    }),
    db.listingView.groupBy({
      by: ["listingId", "viewedOn"],
      where: { viewedOn: { gte: cutoffDay } },
      _count: { _all: true },
    }),
    db.booking.findMany({
      where: { createdAt: { gte: cutoff } },
      select: { listingId: true, createdAt: true, status: true },
    }),
  ]);

  const viewsByListing = new Map<string, DailyCount[]>();
  for (const group of viewGroups) {
    addDaily(viewsByListing, group.listingId, group.viewedOn, group._count._all);
  }

  const bookingsByListing = new Map<string, DailyCount[]>();
  const cancelledByListing = new Map<string, DailyCount[]>();
  for (const booking of bookings) {
    const target = ACTIVE_BOOKING_STATUSES.includes(booking.status)
      ? bookingsByListing
      : cancelledByListing;
    addDaily(target, booking.listingId, booking.createdAt, 1);
  }

  const updates: { id: string; score: number }[] = [];
  for (const listing of listings) {
    const score = computePopularityScore(
      {
        views: viewsByListing.get(listing.id) ?? [],
        bookings: bookingsByListing.get(listing.id) ?? [],
        cancelledBookings: cancelledByListing.get(listing.id) ?? [],
      },
      now
    );
    // Skip no-op writes: on a quiet day most listings' scores are unchanged, and every
    // write would otherwise churn the index for nothing.
    if (score !== listing.popularityScore) updates.push({ id: listing.id, score });
  }

  let listingsUpdated = 0;
  for (let i = 0; i < updates.length; i += WRITE_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + WRITE_CHUNK_SIZE);
    // Raw UPDATE rather than db.listing.update: `Listing.updatedAt` is `@updatedAt` and
    // means "last edited by a human" — it orders the host's listings page and the admin
    // review queue. A nightly scoring job must not touch it. Re-check APPROVED in the
    // write itself: a lifecycle transition can happen after the read above, and a stale
    // scoring pass must not restore a score to a listing that just left the market.
    listingsUpdated += await db.$executeRaw`
      UPDATE "Listing" AS l
      SET "popularityScore" = v.score, "popularityUpdatedAt" = ${now}
      FROM (
        SELECT unnest(${chunk.map((u) => u.id)}::text[]) AS id,
               unnest(${chunk.map((u) => u.score)}::double precision[]) AS score
      ) AS v
      WHERE l.id = v.id
        AND l.status = ${ListingStatus.APPROVED}::"ListingStatus"
    `;
  }

  let listingsCleared = 0;
  for (let i = 0; i < staleListings.length; i += WRITE_CHUNK_SIZE) {
    const chunk = staleListings.slice(i, i + WRITE_CHUNK_SIZE);
    // There is one value for every row, so there is nothing to unnest. The status guard
    // is still essential: if a host republishes after the stale-row scan, this sweep
    // must not erase the approved listing's newly valid score.
    listingsCleared += await db.$executeRaw`
      UPDATE "Listing"
      SET "popularityScore" = 0, "popularityUpdatedAt" = NULL
      WHERE id = ANY(${chunk.map((listing) => listing.id)}::text[])
        AND status <> ${ListingStatus.APPROVED}::"ListingStatus"
    `;
  }

  const pruned = await db.listingView.deleteMany({ where: { viewedOn: { lt: cutoffDay } } });

  return {
    listingsScored: listings.length,
    listingsUpdated,
    listingsCleared,
    viewsPruned: pruned.count,
  };
}

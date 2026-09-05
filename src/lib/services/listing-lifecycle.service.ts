import "server-only";

import { BookingStatus, ListingStatus, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { NO_POPULARITY } from "@/lib/services/popularity.service";

export const UNPUBLISH_PENDING_BOOKINGS_ERROR =
  "Accept or decline pending booking requests before unpublishing this listing.";

type ListingLifecycleFailure = { success: false; error: string };
type ListingLifecycleSuccess = { success: true; listingTitle: string };
export type ListingLifecycleResult =
  | ListingLifecycleSuccess
  | ListingLifecycleFailure;

/**
 * Listing status and booking creation/acceptance are one per-listing lifecycle.
 * Every writer in that lifecycle takes this same transaction-scoped lock before it
 * re-reads either side, so a stale browser cannot make two individually valid writes
 * combine into an invalid state.
 */
async function lockListingLifecycle(
  tx: Prisma.TransactionClient,
  listingId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
}

export async function unpublishOwnedListing(
  listingId: string,
  hostId: string,
): Promise<ListingLifecycleResult> {
  return db.$transaction(async (tx) => {
    await lockListingLifecycle(tx, listingId);

    const listing = await tx.listing.findFirst({
      where: { id: listingId, hostId },
      select: { id: true, title: true, status: true },
    });
    if (!listing || listing.status !== ListingStatus.APPROVED) {
      return {
        success: false,
        error: "Listing not found or cannot be unpublished",
      };
    }

    const pendingBookings = await tx.booking.count({
      where: { listingId, status: BookingStatus.PENDING },
    });
    if (pendingBookings > 0) {
      return { success: false, error: UNPUBLISH_PENDING_BOOKINGS_ERROR };
    }

    await tx.listing.update({
      where: { id: listingId },
      // The score goes with the visibility. `recomputePopularityScores` only scores
      // APPROVED listings, so a score left behind here would sit untouched until the
      // listing was republished and then rank it on months-old traffic.
      data: { status: ListingStatus.UNPUBLISHED, ...NO_POPULARITY },
    });
    return { success: true, listingTitle: listing.title };
  });
}

export async function archiveOwnedListing(
  listingId: string,
  hostId: string,
): Promise<ListingLifecycleResult> {
  return db.$transaction(async (tx) => {
    await lockListingLifecycle(tx, listingId);

    const listing = await tx.listing.findFirst({
      where: { id: listingId, hostId },
      select: { id: true, title: true, status: true },
    });
    if (!listing) return { success: false, error: "Listing not found" };
    if (listing.status === ListingStatus.ARCHIVED) {
      return { success: true, listingTitle: listing.title };
    }

    const activeBookings = await tx.booking.count({
      where: {
        listingId,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      },
    });
    if (activeBookings > 0) {
      return {
        success: false,
        error:
          "Cannot archive a listing with active bookings. Cancel or complete pending bookings first.",
      };
    }

    await tx.listing.update({
      where: { id: listingId },
      data: { status: ListingStatus.ARCHIVED, ...NO_POPULARITY },
    });
    return { success: true, listingTitle: listing.title };
  });
}

/** Admin moderation stays available regardless of booking state. The lock only orders
 * it against an in-flight acceptance; it deliberately performs no booking writes. */
export async function suspendListingForAdmin(
  listingId: string,
  reason: string,
): Promise<ListingLifecycleResult> {
  return db.$transaction(async (tx) => {
    await lockListingLifecycle(tx, listingId);

    const listing = await tx.listing.findUnique({
      where: { id: listingId },
      select: { id: true, title: true, status: true },
    });
    if (!listing || listing.status !== ListingStatus.APPROVED) {
      return {
        success: false,
        error: "Only approved listings can be suspended",
      };
    }

    await tx.listing.update({
      where: { id: listingId },
      data: {
        status: ListingStatus.SUSPENDED,
        moderationNote: reason,
        needsReview: false,
        ...NO_POPULARITY,
      },
    });
    return { success: true, listingTitle: listing.title };
  });
}

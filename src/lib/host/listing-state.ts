import type { HostListingOverviewItem } from "@/lib/services/host-listing-overview.service";

/**
 * One line per listing, answering "what is true about this right now?".
 *
 * The overview deliberately shows a single state rather than a stack of badges: a host
 * scanning five rows needs the most urgent fact per row, not an inventory of every
 * imperfection. Resolution is therefore strictly ordered — broken beats blocked, blocked
 * beats waiting, and only a listing with nothing wrong reports how it is trading.
 *
 * Kept free of i18n and JSX so the ordering can be tested directly.
 */

export type ListingStateTone = "error" | "warning" | "waiting" | "neutral";

export type ListingStateCode =
  | "SYNC_FAILED"
  | "SUSPENDED"
  | "NO_PRICE"
  | "OUT_OF_DATES"
  | "FEW_PHOTOS"
  | "NEEDS_REVIEW"
  | "HIDDEN"
  | "ARCHIVED"
  | "NEXT_CHECK_IN"
  | "NIGHTS_BOOKED"
  | "NO_BOOKINGS";

export type ListingState = {
  code: ListingStateCode;
  tone: ListingStateTone;
  /** Interpolated into the translated string. Dates stay `Date` so the caller can
   *  format them in the host's locale rather than the server's. */
  values: Record<string, string | number | Date>;
};

export function resolveListingState(
  listing: HostListingOverviewItem
): ListingState {
  // ── Broken: the listing is losing bookings and the host has not been told ──────
  if (listing.failingFeedName) {
    return {
      code: "SYNC_FAILED",
      tone: "error",
      values: {
        feed: listing.failingFeedName,
        ...(listing.failingFeedSyncedAt
          ? { date: listing.failingFeedSyncedAt }
          : {}),
      },
    };
  }
  if (listing.status === "SUSPENDED") {
    return { code: "SUSPENDED", tone: "error", values: {} };
  }

  // ── Blocked: live, or nearly so, but a guest cannot complete a booking ─────────
  if (listing.status !== "ARCHIVED" && listing.baseNightlyRate === null) {
    return { code: "NO_PRICE", tone: "warning", values: {} };
  }
  if (listing.status === "APPROVED" && listing.outOfBookableDates) {
    return { code: "OUT_OF_DATES", tone: "warning", values: {} };
  }
  if (
    listing.status === "APPROVED" &&
    listing.photoCount < listing.photoTarget
  ) {
    return {
      code: "FEW_PHOTOS",
      tone: "warning",
      values: { count: listing.photoCount, target: listing.photoTarget },
    };
  }

  // ── Waiting: someone else has the next move, or the host paused it themselves ──
  if (listing.status === "ARCHIVED") {
    return { code: "ARCHIVED", tone: "waiting", values: {} };
  }
  // Moderation is post-publication, so "waiting for review" is a flag on a live
  // listing rather than a status of its own.
  if (listing.needsReview) {
    return { code: "NEEDS_REVIEW", tone: "waiting", values: {} };
  }
  if (listing.status === "UNPUBLISHED" || listing.status === "DRAFT") {
    return { code: "HIDDEN", tone: "waiting", values: {} };
  }

  // ── Healthy: nothing to fix, so report how it is actually trading ─────────────
  if (listing.nextCheckIn) {
    return {
      code: "NEXT_CHECK_IN",
      tone: "neutral",
      values: { date: listing.nextCheckIn, nights: listing.upcomingNights },
    };
  }
  if (listing.upcomingNights > 0) {
    return {
      code: "NIGHTS_BOOKED",
      tone: "neutral",
      values: {
        nights: listing.upcomingNights,
        days: listing.upcomingWindowDays,
      },
    };
  }
  return {
    code: "NO_BOOKINGS",
    tone: "neutral",
    values: { days: listing.upcomingWindowDays },
  };
}

/** Whether a state is something the host should act on — drives the grid's badge and
 *  any future "N listings need attention" count. */
export function isActionableState(state: ListingState) {
  return state.tone === "error" || state.tone === "warning";
}

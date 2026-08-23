import type {
  HostCalendarDateCounts,
  HostCalendarListing,
} from "@/lib/host/v2/calendar-types";
import { validateStoredListingAvailabilityForPublish } from "@/lib/types/listing-availability-start";
import { ymdToDbDate } from "@/lib/utils/date-only";

/**
 * Three questions the host panel has always answered as one, and must not:
 *
 * - **Visibility** — is the listing on the site at all? (`Listing.status`)
 * - **Discoverability** — can a guest *find* it? (status plus `availabilityMode`, which
 *   is what `search.service` filters undated discovery on)
 * - **Bookability** — can a guest complete a booking on a date? (the calendar, *and*
 *   whether the listing is in a state that can sell anything at all)
 *
 * A listing can be live, undiscoverable and fully bookable at once. Deriving any of
 * these from `status === "APPROVED"` alone is what produced "your listing is live"
 * next to a calendar with every date blocked.
 */
export type HostListingVisibility =
  | "LIVE"
  | "HIDDEN"
  | "DRAFT"
  | "IN_REVIEW"
  | "REJECTED"
  | "SUSPENDED"
  | "ARCHIVED";

export type HostListingDiscoverability =
  /** Appears in undated browsing and in dated search. */
  | "SEARCH_AND_DATES"
  /** Closed-by-default: only surfaces for a dated search the host has opened. */
  | "DATED_SEARCH_ONLY"
  | "NOT_DISCOVERABLE";

export type HostListingBookability =
  | "BOOKABLE"
  | "NONE_BOOKABLE"
  | "NOT_LIVE"
  | "NO_PRICING";

export type HostListingTone = "positive" | "warning" | "neutral";

/**
 * Why *no* date on this listing can be booked, however open the calendar looks.
 *
 * An open date on a listing that is off the site, or has no price, is not a date a
 * guest can book — it is only a date the host has not blocked. Keeping that distinction
 * in one place is what stops the calendar painting those days as available.
 */
export type ListingSaleBlocker = "NOT_LIVE" | "NO_PRICING";

export function listingSaleBlockers(
  listing: HostCalendarListing,
): ListingSaleBlocker[] {
  const blockers: ListingSaleBlocker[] = [];
  if (listing.status !== "APPROVED") blockers.push("NOT_LIVE");
  if (!listing.pricing) blockers.push("NO_PRICING");
  return blockers;
}

/** True when the listing itself is in a state that can sell an open date. */
export function listingCanSell(listing: HostCalendarListing): boolean {
  return listingSaleBlockers(listing).length === 0;
}

export interface HostListingStatusSummary {
  listingId: string;
  visibility: HostListingVisibility;
  live: boolean;
  discoverability: HostListingDiscoverability;
  bookability: HostListingBookability;
  counts: HostCalendarDateCounts;
  horizonMonths: number;
  tone: HostListingTone;
  /** True when guests can see the listing but book none of its dates. */
  liveButUnbookable: boolean;
}

export function listingVisibility(status: string): HostListingVisibility {
  switch (status) {
    case "APPROVED":
      return "LIVE";
    case "UNPUBLISHED":
      return "HIDDEN";
    case "PENDING_REVIEW":
      return "IN_REVIEW";
    case "REJECTED":
      return "REJECTED";
    case "SUSPENDED":
      return "SUSPENDED";
    case "ARCHIVED":
      return "ARCHIVED";
    default:
      return "DRAFT";
  }
}

/**
 * Whether the public listing page exists for this status.
 *
 * `getListingBySlug` serves `APPROVED` listings and nothing else, so a "Preview" link
 * on a draft or an unpublished listing opens a 404. One helper rather than a status
 * comparison at each call site, so the editor's three preview controls agree.
 */
export function listingPreviewable(status: string): boolean {
  return listingVisibility(status) === "LIVE";
}

export function summarizeListingStatus({
  listing,
  counts,
  horizonMonths,
}: {
  listing: HostCalendarListing;
  counts: HostCalendarDateCounts;
  horizonMonths: number;
}): HostListingStatusSummary {
  const visibility = listingVisibility(listing.status);
  const live = visibility === "LIVE";

  const discoverability: HostListingDiscoverability = !live
    ? "NOT_DISCOVERABLE"
    : listing.availabilityMode === "OPEN"
      ? "SEARCH_AND_DATES"
      : "DATED_SEARCH_ONLY";

  const bookability: HostListingBookability = !listing.pricing
    ? "NO_PRICING"
    : !live
      ? "NOT_LIVE"
      : counts.bookable === 0
        ? "NONE_BOOKABLE"
        : "BOOKABLE";

  const liveButUnbookable = live && bookability !== "BOOKABLE";

  const tone: HostListingTone =
    bookability === "BOOKABLE"
      ? "positive"
      : liveButUnbookable
        ? "warning"
        : "neutral";

  return {
    listingId: listing.id,
    visibility,
    live,
    discoverability,
    bookability,
    counts,
    horizonMonths,
    tone,
    liveButUnbookable,
  };
}

/**
 * Everything `submitForReview` checks, checked here too.
 *
 * The action is still the authority — it re-runs all of this on the server. The point
 * of mirroring it is that the host is told what is missing *before* they reach a save
 * button, instead of pressing it and receiving one terse rejection.
 */
export type PublishBlocker =
  | "STATUS"
  | "PRICING"
  | "PHOTOS"
  | "AVAILABILITY_UNCONFIRMED";

export const PUBLISH_MINIMUM_PHOTOS = 3;

export function publishBlockers(
  listing: HostCalendarListing,
  now: Date = new Date(),
): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];

  if (
    listing.status !== "DRAFT" &&
    listing.status !== "REJECTED" &&
    listing.status !== "UNPUBLISHED"
  ) {
    blockers.push("STATUS");
  }
  if (!listing.pricing) blockers.push("PRICING");
  if (listing.photoCount < PUBLISH_MINIMUM_PHOTOS) blockers.push("PHOTOS");

  const availability = validateStoredListingAvailabilityForPublish(
    {
      availabilityMode: listing.availabilityMode,
      publishedAt: listing.publishedAt,
      availabilityBlocks: listing.blocks.map((block) => ({
        startDate: ymdToDbDate(block.startDate),
        endDate: ymdToDbDate(block.endDate),
        reason: block.reason,
      })),
    },
    now,
  );
  if (!availability.ok) blockers.push("AVAILABILITY_UNCONFIRMED");

  return blockers;
}

/** Whether `submitForReview` would accept this listing — all of its checks, not one. */
export function canPublish(
  listing: HostCalendarListing,
  now: Date = new Date(),
): boolean {
  return publishBlockers(listing, now).length === 0;
}

/** Whether `unpublishListing` would accept this listing — mirrors its own guard. */
export function canHide(listing: HostCalendarListing): boolean {
  return listing.status === "APPROVED";
}

/** Whether the host could reach the publish flow at all, blockers aside. */
export function isPublishableStatus(listing: HostCalendarListing): boolean {
  return (
    listing.status === "DRAFT" ||
    listing.status === "REJECTED" ||
    listing.status === "UNPUBLISHED"
  );
}

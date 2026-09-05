import "server-only";
import { db } from "@/lib/db";
import {
  compareYmd,
  dbDateToYmd,
  nightsBetweenYmd,
  todayYmd,
  ymdToDbDate,
  isValidYmd,
} from "@/lib/utils/date-only";
import type { ChangeoverWeekdayName } from "@/lib/utils/weekly-stay";
import { stayLengthCap } from "@/lib/utils/booking-selection";
import { windowsOverlappingStay } from "@/lib/utils/availability-windows";
import { decideStayAvailability } from "@/lib/utils/stay-availability";
import {
  getBlockedDateRangesForListing,
  type BlockedDateRange,
} from "@/lib/services/availability.service";

/**
 * What the promotion workspace needs to know about one listing, and the one rule that
 * decides whether a range the host picked may be advertised.
 *
 * The rule is deliberately the booking rule, read from the same columns
 * `createBooking` reads: availability windows, availability blocks (which is what a
 * confirmed booking becomes), minimum stay and maximum stay. A separate "close enough"
 * check here would eventually disagree with the booking service, and the failure mode
 * is a host publishing dates to a Facebook group that nobody can actually book.
 */

/**
 * One photo or clip a host may take with them to a channel that needs a file.
 *
 * Same-origin `/uploads/...` paths, which is what makes the download a plain anchor
 * with a `download` attribute rather than a proxy: a cross-origin bucket would have
 * needed one, and this does not.
 */
export interface PromotionMediaItem {
  id: string;
  url: string;
  mediaType: "IMAGE" | "VIDEO";
  /** The listing's cover, and the image the Open Graph link card already shows. */
  isPrimary: boolean;
}

/** Enough for a post; past this a picker stops being a strip and becomes a gallery. */
const PROMOTION_MEDIA_LIMIT = 12;

export interface PromotionListingView {
  id: string;
  slug: string;
  title: string;
  description: string;
  city: string | null;
  /** The cover, kept as its own field because the workspace header and the link-card
   *  preview both want exactly one image and neither should have to pick. */
  imageUrl: string | null;
  /**
   * Everything the host could attach, cover first. Instagram cannot be posted without
   * one of these, and a Facebook group post carrying real photos outperforms the link
   * card — at the cost of the card, since Facebook renders one or the other.
   */
  media: PromotionMediaItem[];
  maxGuests: number;
  baseNightlyRate: number | null;
  currency: string | null;
  minNights: number;
  /** The host's stay cap, or null when they set none — already resolved through
   *  `stayLengthCap`, so the client never has to reinterpret a stored zero. */
  maxNights: number | null;
  /**
   * Every run of unbookable days, as `yyyy-MM-dd` — exactly what the guest calendar
   * receives. For a CLOSED calendar this already includes the complement of the host's
   * open windows, so the picker greys out the same days the public page does without
   * re-deriving that rule here.
   */
  blockedDateRanges: BlockedDateRange[];
  /** Today in the marketplace's zone. The picker must not let a host advertise
   *  yesterday, and the browser's own clock is not the marketplace's. */
  today: string;
}

/**
 * The promotion workspace's data, scoped to a listing this host owns and published.
 *
 * Returns null for anything else — not owned, not APPROVED, missing. Only a published
 * listing has a public page to promote, so promoting a draft would send a guest to a
 * 404, and an admin viewing someone else's listing is not the person whose Facebook
 * groups these are.
 */
export async function getPromotionListing(
  hostId: string,
  listingId: string,
): Promise<PromotionListingView | null> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId, status: "APPROVED" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      maxGuests: true,
      property: { select: { city: true } },
      // Video comes too. A clip is what a Reel is made of, and a host who filmed the
      // terrace should not have to go and find the file themselves.
      images: {
        orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }],
        take: PROMOTION_MEDIA_LIMIT,
        select: { id: true, url: true, mediaType: true, isPrimary: true },
      },
      pricingRule: {
        select: {
          baseNightlyRate: true,
          currency: true,
          minNights: true,
          maxNights: true,
        },
      },
    },
  });
  if (!listing) return null;

  const today = todayYmd();
  const blockedDateRanges = await getBlockedDateRangesForListing(listing.id);

  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    description: listing.description,
    city: listing.property?.city ?? null,
    // The cover is the first image, not the first item: a listing whose primary asset
    // is a clip still needs a still for the header and the link-card preview.
    imageUrl:
      listing.images.find((item) => item.mediaType === "IMAGE")?.url ?? null,
    media: listing.images.map((item) => ({
      id: item.id,
      url: item.url,
      mediaType: item.mediaType,
      isPrimary: item.isPrimary,
    })),
    maxGuests: listing.maxGuests,
    baseNightlyRate: listing.pricingRule
      ? Number(listing.pricingRule.baseNightlyRate)
      : null,
    currency: listing.pricingRule?.currency ?? null,
    minNights: listing.pricingRule?.minNights ?? 1,
    maxNights: stayLengthCap(listing.pricingRule?.maxNights),
    blockedDateRanges,
    today,
  };
}

export type PromotionRangeRejection =
  | "INVALID_DATES"
  | "IN_THE_PAST"
  | "BELOW_MINIMUM"
  | "ABOVE_MAXIMUM"
  | "NOT_OPEN"
  | "ALREADY_BOOKED"
  /** Weekly listing: check-in is not on the host's changeover weekday. */
  | "WRONG_CHECK_IN_DAY"
  /** Weekly listing: checkout is not either, so the range is not whole weeks. */
  | "WRONG_CHECK_OUT_DAY"
  /** Weekly listing whose host has not chosen a changeover day yet. */
  | "NO_CHANGEOVER_DAY"
  | "LISTING_NOT_PROMOTABLE";

export type PromotionRangeCheck =
  | { ok: true; checkIn: string; checkOut: string; nights: number }
  | {
      ok: false;
      reason: PromotionRangeRejection;
      minNights?: number;
      maxNights?: number;
    };

/**
 * Whether a guest could actually book `[checkIn, checkOut)` right now.
 *
 * Called twice by design: once when the host picks dates, and again immediately before
 * the post text is generated or copied. The gap between those two moments is exactly
 * where a booking arrives, and a post that advertises a week somebody just took is the
 * failure this second call exists to prevent.
 *
 * Not transactional and not a hold. It is a read of the current truth, and it says so —
 * the workspace pairs the dates with an "availability checked <date>" line rather than
 * presenting them as a guarantee.
 */
export async function checkPromotionRange(
  hostId: string,
  listingId: string,
  checkIn: string,
  checkOut: string,
  now = todayYmd(),
): Promise<PromotionRangeCheck> {
  if (!isValidYmd(checkIn) || !isValidYmd(checkOut)) {
    return { ok: false, reason: "INVALID_DATES" };
  }
  if (compareYmd(checkOut, checkIn) <= 0) {
    return { ok: false, reason: "INVALID_DATES" };
  }
  if (compareYmd(checkIn, now) < 0) {
    return { ok: false, reason: "IN_THE_PAST" };
  }

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId, status: "APPROVED" },
    select: {
      id: true,
      availabilityMode: true,
      // The two columns a weekly listing's shape is made of. They were missing, which
      // is precisely how a weekly host could validate and publish a Tue-to-Fri range
      // that `createBooking` refuses with "Check-in must be on a Saturday" — the exact
      // failure mode the doc above says this check exists to prevent.
      bookingMode: true,
      changeoverWeekday: true,
      pricingRule: { select: { minNights: true, maxNights: true } },
      availabilityWindows: {
        where: windowsOverlappingStay(
          ymdToDbDate(checkIn),
          ymdToDbDate(checkOut),
        ),
        select: { startDate: true, endDate: true },
      },
    },
  });
  if (!listing) return { ok: false, reason: "LISTING_NOT_PROMOTABLE" };

  // The booking rule itself, not a second implementation of it. Availability windows,
  // the weekly shape and the listing's stay limits are one decision in one place, so a
  // range this call blesses is a range `createBooking` accepts.
  //
  // `today` is passed as `checkIn` rather than as `now` because the past-date rule has
  // already been applied above, with its own IN_THE_PAST reason: a host needs to be told
  // their range has started, not that it is "not offered".
  const decision = decideStayAvailability({
    bookingMode: listing.bookingMode,
    availabilityMode: listing.availabilityMode,
    windows: listing.availabilityWindows.map((window) => ({
      startDate: dbDateToYmd(window.startDate),
      endDate: dbDateToYmd(window.endDate),
    })),
    changeoverWeekday: listing.changeoverWeekday as ChangeoverWeekdayName | null,
    limits: {
      minNights: listing.pricingRule?.minNights ?? 1,
      maxNights: listing.pricingRule?.maxNights ?? null,
    },
    checkIn,
    checkOut,
    today: checkIn,
  });
  // Counted off calendar dates, never with a local-day difference: over the
  // UTC-midnight values these are, a daylight-saving change drops a night and would
  // measure a legitimate stay as short of the host's own minimum (M6).
  const nights = nightsBetweenYmd(checkIn, checkOut);
  if (!decision.offered) {
    switch (decision.reason) {
      case "OUTSIDE_AVAILABILITY_WINDOWS":
        return { ok: false, reason: "NOT_OPEN" };
      case "BELOW_MINIMUM":
        return {
          ok: false,
          reason: "BELOW_MINIMUM",
          minNights: listing.pricingRule?.minNights ?? 1,
        };
      case "ABOVE_MAXIMUM":
        return {
          ok: false,
          reason: "ABOVE_MAXIMUM",
          maxNights: stayLengthCap(listing.pricingRule?.maxNights) ?? nights,
        };
      case "WRONG_CHECK_IN_DAY":
      case "WRONG_CHECK_OUT_DAY":
      case "NO_CHANGEOVER_DAY":
        return { ok: false, reason: decision.reason };
      default:
        return { ok: false, reason: "INVALID_DATES" };
    }
  }

  // Confirmed bookings become BOOKING_HOLD blocks, so this one query covers both a
  // guest who booked the week and a host who blocked it by hand.
  const overlapping = await db.availabilityBlock.findFirst({
    where: {
      listingId: listing.id,
      startDate: { lt: ymdToDbDate(checkOut) },
      endDate: { gt: ymdToDbDate(checkIn) },
    },
    select: { id: true },
  });
  if (overlapping) return { ok: false, reason: "ALREADY_BOOKED" };

  return { ok: true, checkIn, checkOut, nights };
}

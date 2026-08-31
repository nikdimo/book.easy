import "server-only";
import { db } from "@/lib/db";
import {
  compareYmd,
  nightsBetweenYmd,
  todayYmd,
  ymdToDbDate,
  isValidYmd,
} from "@/lib/utils/date-only";
import {
  exceedsMaxNights,
  stayLengthCap,
} from "@/lib/utils/booking-selection";
import {
  isStayWithinAvailabilityWindows,
  windowsOverlappingStay,
} from "@/lib/utils/availability-windows";
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

export interface PromotionListingView {
  id: string;
  slug: string;
  title: string;
  description: string;
  city: string | null;
  imageUrl: string | null;
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
      images: {
        where: { mediaType: "IMAGE" },
        orderBy: [{ isPrimary: "desc" }, { displayOrder: "asc" }],
        take: 1,
        select: { url: true },
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
    imageUrl: listing.images.at(0)?.url ?? null,
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

  if (
    !isStayWithinAvailabilityWindows({
      availabilityMode: listing.availabilityMode,
      windows: listing.availabilityWindows,
      checkIn: ymdToDbDate(checkIn),
      checkOut: ymdToDbDate(checkOut),
    })
  ) {
    return { ok: false, reason: "NOT_OPEN" };
  }

  // Counted off calendar dates, never with a local-day difference: over the
  // UTC-midnight values these are, a daylight-saving change drops a night and would
  // measure a legitimate stay as short of the host's own minimum (M6).
  const nights = nightsBetweenYmd(checkIn, checkOut);
  const minNights = listing.pricingRule?.minNights ?? 1;
  if (nights < minNights) {
    return { ok: false, reason: "BELOW_MINIMUM", minNights };
  }
  const cap = stayLengthCap(listing.pricingRule?.maxNights);
  if (exceedsMaxNights(nights, listing.pricingRule?.maxNights)) {
    return { ok: false, reason: "ABOVE_MAXIMUM", maxNights: cap ?? nights };
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

import "server-only";
import { db } from "@/lib/db";
import {
  houseRulesFromRow,
  type ListingHouseRulesInput,
} from "@/lib/host/v2/listing-house-rules";
import { todayYmd, ymdToDbDate } from "@/lib/utils/date-only";

/** The columns the House rules section reads. Shared with the server action so a field
 *  added to one is present in the other. */
export const LISTING_HOUSE_RULES_SELECT = {
  id: true,
  slug: true,
  status: true,
  checkInTime: true,
  checkInEndTime: true,
  checkOutTime: true,
  maxGuests: true,
  petPolicy: true,
  smokingPolicy: true,
  eventPolicy: true,
  quietHoursPolicy: true,
  quietHoursPeriods: true,
  quietHoursStart: true,
  quietHoursEnd: true,
  additionalRules: true,
  houseRulesReviewedAt: true,
} as const;

export interface ListingHouseRulesEditorData {
  listing: {
    id: string;
    slug: string;
    status: string;
  };
  /** Everything the shared rules component renders, already normalised: "" for a
   *  flexible time, null for a policy the host has never answered. */
  rules: ListingHouseRulesInput;
  /** When the host last saved this section, or null if they never have. This is what
   *  the editor's completion tick is a claim about — not "the fields have values",
   *  which is true of every listing the moment it exists. */
  reviewedAt: Date | null;
  /**
   * The largest party on a stay that has not finished yet, or 0 when there is none.
   *
   * Only used to warn: a host lowering the guest count below a party they have already
   * accepted is doing something legitimate that they nonetheless probably did not mean
   * to, and nothing else on this screen can tell them.
   */
  largestUpcomingParty: number;
}

/**
 * Everything the House rules section renders from.
 *
 * Scoped to `hostId` inside the query rather than checked afterwards, so a listing the
 * caller does not own comes back as "not found" instead of leaking that it exists — the
 * same shape the rest of the editor's reads use. The booking aggregate is scoped by the
 * listing id that read already proved belongs to this host.
 */
export async function getListingHouseRulesEditorData(
  listingId: string,
  hostId: string,
): Promise<ListingHouseRulesEditorData | null> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: LISTING_HOUSE_RULES_SELECT,
  });
  if (!listing) return null;

  // A stay is still "upcoming" on the morning a guest leaves, so the comparison is
  // against today rather than now — `checkOut` is a date column with no time on it.
  const busiest = await db.booking.aggregate({
    where: {
      listingId: listing.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      checkOut: { gte: ymdToDbDate(todayYmd()) },
    },
    _max: { guestCount: true },
  });

  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    rules: houseRulesFromRow(listing),
    reviewedAt: listing.houseRulesReviewedAt,
    largestUpcomingParty: busiest._max.guestCount ?? 0,
  };
}

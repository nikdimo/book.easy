import "server-only";
import { db } from "@/lib/db";
import { normalizeStayTime } from "@/lib/host/v2/listing-house-rules";

export interface ListingArrivalGuideEditorData {
  listing: {
    id: string;
    slug: string;
    status: string;
  };
  /** Normalised for display without losing imported minute-level values. */
  checkInTime: string;
  checkOutTime: string;
}

/**
 * Everything the Arrival guide section renders from.
 *
 * Scoped to `hostId` inside the query rather than checked afterwards, so a listing the
 * caller does not own comes back as "not found" instead of leaking that it exists — the
 * same shape the rest of the editor's reads use.
 *
 * This is a read-only summary. House rules is the sole writer for these columns. The
 * explicit select is intentional: a future sensitive arrival field must never appear
 * here merely because somebody added it to Listing.
 */
export async function getListingArrivalGuideEditorData(
  listingId: string,
  hostId: string,
): Promise<ListingArrivalGuideEditorData | null> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: {
      id: true,
      slug: true,
      status: true,
      checkInTime: true,
      checkOutTime: true,
    },
  });
  if (!listing) return null;

  const checkInTime = normalizeStayTime(listing.checkInTime);
  const checkOutTime = normalizeStayTime(listing.checkOutTime);

  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    checkInTime,
    checkOutTime,
  };
}

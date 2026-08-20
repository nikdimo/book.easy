import "server-only";
import { db } from "@/lib/db";
import { listingBasicsComplete } from "@/lib/host/v2/listing-basics";

export interface ListingBasicsEditorData {
  listing: {
    id: string;
    slug: string;
    status: string;
  };
  /** The host's own words, exactly as stored. Never a translation of them — see the
   *  note on the workspace component. */
  title: string;
  description: string;
  complete: boolean;
}

/**
 * Everything the Title & description section renders from.
 *
 * Scoped to `hostId` inside the query rather than checked afterwards, so a listing the
 * caller does not own comes back as "not found" instead of leaking that it exists —
 * the same shape the rest of the editor's reads use.
 */
export async function getListingBasicsEditorData(
  listingId: string,
  hostId: string,
): Promise<ListingBasicsEditorData | null> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: {
      id: true,
      slug: true,
      status: true,
      title: true,
      description: true,
    },
  });
  if (!listing) return null;

  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    title: listing.title,
    description: listing.description,
    complete: listingBasicsComplete({
      title: listing.title,
      description: listing.description,
    }),
  };
}

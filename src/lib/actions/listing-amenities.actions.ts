"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireHost } from "@/lib/auth-helpers";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";

/** A listing with more amenities than the whole catalog holds is a broken client, not a
 *  very well equipped villa. The cap stops one from asking for an unbounded write. */
const MAX_AMENITIES = 500;

export interface SetListingAmenitiesResult {
  error?: string;
  /** What the listing holds after the write, so the client can settle on the server's
   *  answer rather than assume its optimistic state was accepted. */
  selectedIds?: string[];
}

function refresh(listingId: string, slug: string, status: string) {
  revalidatePath(`/host/v2/listings/${listingId}/amenities`);
  revalidatePath(`/host/v2/listings/${listingId}`);
  revalidatePath(`/host/listings/${listingId}/edit`);
  // Only a live listing has public pages worth rebuilding; a draft's amenities are not
  // on any guest-facing surface yet.
  if (status === "APPROVED") {
    revalidatePath(`/properties/${slug}`);
    revalidatePublicListingCaches();
  }
}

/**
 * Replaces this listing's amenity selection with `amenityIds`.
 *
 * The whole set travels rather than one toggle. Amenities are a small, unordered set and
 * the editor autosaves on a debounce, so sending the state the host is actually looking
 * at makes the result identical to what they saw — where a stream of individual toggles
 * would let two coalesced saves land out of order and leave the listing holding neither.
 *
 * Nothing here trusts the ids: an id has to exist, and it has to be one this host could
 * legitimately have been offered — an active row in an active category, or a row this
 * listing already holds. That second clause is what keeps a hidden or listing-only
 * amenity survivable across a save instead of being stripped the first time the host
 * touches an unrelated checkbox.
 */
export async function setListingAmenities(
  listingId: string,
  amenityIds: string[],
): Promise<SetListingAmenitiesResult> {
  const user = await requireHost();

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: user.id },
    select: {
      id: true,
      slug: true,
      status: true,
      amenities: { select: { amenityId: true } },
    },
  });
  if (!listing) return { error: "Listing not found." };

  const requested = [...new Set(amenityIds)];
  if (requested.length > MAX_AMENITIES) {
    return { error: "That is more amenities than we can save at once." };
  }

  const current = new Set(listing.amenities.map((row) => row.amenityId));

  const known =
    requested.length === 0
      ? []
      : await db.amenity.findMany({
          where: { id: { in: requested } },
          select: { id: true, isActive: true, category: { select: { isActive: true } } },
        });

  const allowed = new Set(
    known
      .filter((row) => (row.isActive && row.category.isActive) || current.has(row.id))
      .map((row) => row.id),
  );
  if (allowed.size !== requested.length) {
    return { error: "Some of those amenities are no longer available. Reload and try again." };
  }

  const toAdd = requested.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !allowed.has(id));

  if (toAdd.length > 0 || toRemove.length > 0) {
    await db.$transaction([
      ...(toRemove.length > 0
        ? [
            db.listingAmenity.deleteMany({
              where: { listingId, amenityId: { in: toRemove } },
            }),
          ]
        : []),
      ...(toAdd.length > 0
        ? [
            db.listingAmenity.createMany({
              data: toAdd.map((amenityId) => ({ listingId, amenityId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    refresh(listing.id, listing.slug, listing.status);
  }

  return { selectedIds: requested };
}

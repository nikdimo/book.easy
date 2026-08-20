import "server-only";
import { db } from "@/lib/db";
import { getAmenityCatalogIncluding } from "@/lib/services/amenity.service";
import type { CatalogAmenity } from "@/lib/types/amenity-catalog";

export interface ListingAmenitiesEditorData {
  listing: {
    id: string;
    slug: string;
    status: string;
  };
  /** Active catalog rows plus any inactive row this listing already holds. */
  catalog: CatalogAmenity[];
  selectedIds: string[];
  /** The subset of `selectedIds` that is no longer part of the offered taxonomy —
   *  hidden by an admin, or approved for this listing alone. */
  hiddenSelectedIds: string[];
}

/**
 * Everything the Amenities section renders from.
 *
 * Scoped to `hostId` inside the query rather than checked afterwards, so a listing the
 * caller does not own comes back as "not found" instead of leaking that it exists —
 * the same shape the rest of the editor's reads use.
 *
 * The catalog itself is the admin-controlled taxonomy, untouched: this only decides
 * *which* of its rows the picker is allowed to show.
 */
export async function getListingAmenitiesEditorData(
  listingId: string,
  hostId: string,
): Promise<ListingAmenitiesEditorData | null> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    select: {
      id: true,
      slug: true,
      status: true,
      amenities: { select: { amenityId: true } },
    },
  });
  if (!listing) return null;

  const selectedIds = listing.amenities.map((row) => row.amenityId);
  // An amenity an admin has since hidden — or one approved for this listing only — is
  // still on this listing. Passing the current selection through means the picker shows
  // it as chosen instead of quietly dropping it the next time the host saves.
  const [catalog, hidden] = await Promise.all([
    getAmenityCatalogIncluding(selectedIds),
    selectedIds.length === 0
      ? []
      : db.amenity.findMany({
          where: {
            id: { in: selectedIds },
            OR: [{ isActive: false }, { category: { isActive: false } }],
          },
          select: { id: true },
        }),
  ]);

  return {
    listing: { id: listing.id, slug: listing.slug, status: listing.status },
    catalog,
    selectedIds,
    hiddenSelectedIds: hidden.map((row) => row.id),
  };
}

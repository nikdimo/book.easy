/** The room taxonomy shape every picker renders from, and the per-listing room shape the
 *  photo editor works with. Kept out of the services so client components can import it
 *  without reaching into a `server-only` module. */

export interface CatalogRoomCategory {
  id: string;
  key: string;
  /** English label — the identity the release snapshot and the AI catalog use. */
  name: string;
  /** Resolved for the requested locale. */
  label: string;
  translated: boolean;
  icon: string | null;
  sortOrder: number;
}

export interface CatalogRoomType {
  id: string;
  key: string;
  name: string;
  label: string;
  translated: boolean;
  icon: string | null;
  sortOrder: number;
  /** Whether the picker still offers this type once the listing already has one. */
  isRepeatable: boolean;
  /** Offered in the rooms rail as a greyed, zero-count row before the host creates it. */
  isStandard: boolean;
  category: CatalogRoomCategory;
}

/** One space on one listing, with its name already resolved for display. */
export interface ListingRoomSummary {
  id: string;
  roomTypeId: string;
  roomTypeKey: string;
  /** What the host sees: their own display name, or the type plus its number when the
   *  listing has more than one room of that type. */
  name: string;
  /** False when `name` came from host-authored text, so the UI can leave it out of the
   *  machine-translation pass. */
  translated: boolean;
  icon: string | null;
  ordinal: number;
  sortOrder: number;
  photoCount: number;
  /** The room's own cover — its first photo in room order. */
  coverUrl: string | null;
}

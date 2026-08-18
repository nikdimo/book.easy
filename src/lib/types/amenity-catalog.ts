/** The catalog shape every picker renders from. Kept out of amenity.service.ts so
 *  client components can import it without reaching into a `server-only` module. */

export interface CatalogCategory {
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

export interface CatalogAmenity {
  id: string;
  key: string;
  name: string;
  label: string;
  translated: boolean;
  icon: string | null;
  sortOrder: number;
  category: CatalogCategory;
}

import type { MapBounds } from "@/lib/map-bounds";

export interface SearchFilters {
  city?: string;
  /** Only set when the exact (city, country) pair is known (e.g. picked from the
   * autocomplete) — narrows the `city` match instead of the default fuzzy contains. */
  country?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  amenities?: string[];
  /** Subset of Prisma `PropertyType`; omit or empty means no type restriction. */
  propertyTypes?: string[];
  page?: number;
  sort?: "price_asc" | "price_desc" | "newest";
  /** Visible map rectangle; listings outside it (and listings with no coordinates
   * at all, since they can never be shown on the map) are excluded. */
  bounds?: MapBounds;
}

export interface SearchFilterPreview {
  totalCount: number;
  availablePropertyTypes: string[];
  availableAmenities: string[];
  maxBedrooms: number;
}

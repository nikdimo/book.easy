export interface SearchFilters {
  city?: string;
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
}

export interface SearchFilterPreview {
  totalCount: number;
  availablePropertyTypes: string[];
  availableAmenities: string[];
  maxBedrooms: number;
}

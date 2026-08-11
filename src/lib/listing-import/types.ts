export type ListingImportProvider = "AIRBNB" | "BOOKING" | "VRBO";

export interface ImportedListingData {
  provider: ListingImportProvider;
  sourceUrl: string;
  title?: string;
  description?: string;
  propertyType?: string;
  /** Provider classification such as "Private room". The current listing model does
   * not expose this separately yet, so it is retained as import provenance. */
  spaceType?: string;
  address?: string;
  city?: string;
  area?: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  maxGuests?: number;
  bedrooms?: number;
  beds?: number;
  bathrooms?: number;
  currency?: string;
  nightlyRate?: number;
  checkInTime?: string;
  checkOutTime?: string;
  locationApproximate?: boolean;
  amenities: string[];
  imageUrls: string[];
}

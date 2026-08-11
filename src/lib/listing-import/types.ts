export type ListingImportProvider = "AIRBNB" | "BOOKING" | "VRBO";

export interface ImportedListingData {
  provider: ListingImportProvider;
  sourceUrl: string;
  title?: string;
  description?: string;
  propertyType?: string;
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
  amenities: string[];
  imageUrls: string[];
}


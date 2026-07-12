import type { ListingMediaItem } from "@/lib/types/listing-media";

/** Shape of ListingDraft.data — a new listing's in-progress form state, autosaved on
 * blur before it's complete enough to become a real Listing/Property row. Every field
 * is optional since the host may have only filled in a few so far. */
export interface ListingDraftData {
  title?: string;
  description?: string;
  propertyType?: string;
  address?: string;
  city?: string;
  area?: string;
  maxGuests?: string;
  bedrooms?: string;
  beds?: string;
  bathrooms?: string;
  baseNightlyRate?: string;
  cleaningFee?: string;
  minNights?: string;
  latitude?: string;
  longitude?: string;
  mediaItems?: ListingMediaItem[];
  imageUrls?: string[];
  amenityIds?: string[];
}

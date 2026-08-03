import type { ListingMediaItem } from "@/lib/types/listing-media";
import type { PrePublishPlan } from "@/lib/types/listing-prepublish-plan";

/** Shape of ListingDraft.data — a new listing's in-progress form state, autosaved on
 * blur before it's complete enough to become a real Listing/Property row. Every field
 * is optional since the host may have only filled in a few so far. */
export interface ListingDraftData {
  /** Legacy: a step *index*. Reordering LISTING_STEPS changes what a stored index
   *  means, which strands in-flight drafts on the wrong screen — currentStepId is the
   *  one that's written now, and this is only read when that's missing. */
  currentStep?: number;
  currentStepId?: string;
  title?: string;
  description?: string;
  propertyType?: string;
  address?: string;
  city?: string;
  area?: string;
  postalCode?: string;
  country?: string;
  locationSource?: string;
  locationConfirmed?: string;
  geocodingProvider?: string;
  geocodingPlaceId?: string;
  geocodingConfidence?: string;
  streetViewHeading?: string;
  streetViewPitch?: string;
  streetViewPanoId?: string;
  maxGuests?: string;
  bedrooms?: string;
  beds?: string;
  bathrooms?: string;
  baseNightlyRate?: string;
  cleaningFee?: string;
  minNights?: string;
  promotionType?: string;
  promotionPercent?: string;
  promotionMinimumNights?: string;
  latitude?: string;
  longitude?: string;
  mediaItems?: ListingMediaItem[];
  imageUrls?: string[];
  amenityIds?: string[];
  /** Optional date-specific setup from the last screen — blocked dates, per-date
   *  prices and dated offers, all applied at publish since there's no listing to hang
   *  them off before then. */
  prePublishPlan?: PrePublishPlan;
}

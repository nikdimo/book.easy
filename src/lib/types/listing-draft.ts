import type { ListingMediaItem } from "@/lib/types/listing-media";
import type { PrePublishPlan } from "@/lib/types/listing-prepublish-plan";
import type { ImportedPriceQuote } from "@/lib/listing-import/types";
import type { PaymentMethodCode } from "@/lib/payments/payment-methods";
import type { PaymentInstructionTemplates } from "@/lib/payments/payment-instruction-templates";

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
  spaceType?: "ENTIRE_PLACE" | "PRIVATE_ROOM" | "SHARED_ROOM" | "HOTEL_ROOM";
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
  currency?: string;
  baseNightlyRate?: string;
  importedPriceQuote?: ImportedPriceQuote;
  cleaningFee?: string;
  minNights?: string;
  acceptedPaymentMethods?: PaymentMethodCode[];
  paymentMethodOther?: string | null;
  paymentInstructionTemplates?: PaymentInstructionTemplates;
  checkInTime?: string;
  checkOutTime?: string;
  /**
   * The structured house rules, as the draft can hold them: strings, because a draft
   * holds whatever a half-finished form had in it.
   *
   * "" and absent both mean the host has not answered — publishing writes NULL for
   * either, which is what keeps an unasked question distinguishable from an explicit
   * "not allowed". See `lib/host/listing-house-rules-draft.ts`, which owns the
   * conversion in both directions.
   */
  petPolicy?: string;
  smokingPolicy?: string;
  eventPolicy?: string;
  quietHoursPolicy?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  additionalRules?: string;
  promotionType?: string;
  promotionPercent?: string;
  promotionMinimumNights?: string;
  /** "true" when the launch offer also waives the cleaning fee. Independent of
   *  promotionType, which stays a single value for the mobile app's benefit —
   *  the two benefits compose, matching ListingPromotion.freeCleaning. */
  promotionFreeCleaning?: string;
  latitude?: string;
  longitude?: string;
  mediaItems?: ListingMediaItem[];
  imageUrls?: string[];
  amenityIds?: string[];
  /** Set when the host used the provider-link importer. Kept on the private draft for
   * troubleshooting and provenance; never rendered on the public listing. */
  importProvider?: "AIRBNB" | "BOOKING" | "VRBO" | "GENERIC";
  importSpaceType?: string;
  importLocationApproximate?: boolean;
  importSourceUrl?: string;
  importedAt?: string;
  /** Optional date-specific setup from the last screen — blocked dates, per-date
   *  prices and dated offers, all applied at publish since there's no listing to hang
   *  them off before then. */
  prePublishPlan?: PrePublishPlan;
}

/** True when a draft holds nothing worth resuming — the host opened the wizard and
 *  left without filling anything in. New saves like this are no longer stored
 *  (see saveListingDraft), but rows created before that are still in the table. */
export function isEmptyListingDraft(data: ListingDraftData): boolean {
  return !(
    data.title?.trim() ||
    data.description?.trim() ||
    data.propertyType?.trim() ||
    data.address?.trim() ||
    data.city?.trim() ||
    data.baseNightlyRate?.trim() ||
    data.mediaItems?.length ||
    data.imageUrls?.length ||
    data.amenityIds?.length
  );
}

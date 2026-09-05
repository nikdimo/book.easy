import type { ListingMediaItem } from "@/lib/types/listing-media";
import type { PrePublishPlan } from "@/lib/types/listing-prepublish-plan";
import type { ImportedPriceQuote } from "@/lib/listing-import/types";
import type { PaymentMethodCode } from "@/lib/payments/payment-methods";
import type { PaymentInstructionTemplates } from "@/lib/payments/payment-instruction-templates";
import type {
  DepositAmountType,
  DepositDueTiming,
} from "@/lib/payments/deposit-policies";

/**
 * One deposit section exactly as the wizard's form holds it.
 *
 * `enabled: false` is a complete answer, not an absent one — the numbers stay beside it
 * so a host who switches a section off and back on gets their values returned rather
 * than an empty form. The amount is a string for the same reason every other money
 * field on a draft is: it is whatever the host typed, and it is validated once, at
 * publish, by `validateDepositPolicies`.
 */
export interface ListingDraftDepositSection {
  enabled: boolean;
  amountType: DepositAmountType;
  value: string;
  dueTiming: DepositDueTiming;
  dueDaysBeforeCheckIn: number | null;
}

export interface ListingDraftDamageDepositSection extends ListingDraftDepositSection {
  returnDaysAfterCheckout: number | null;
}

/** The host's answer to both deposit questions, carried as one object. */
export interface ListingDraftDepositPolicies {
  /** Currency in which the host last reviewed any enabled monetary amount. */
  currency?: string;
  advancePayment: ListingDraftDepositSection;
  damageDeposit: ListingDraftDamageDepositSection;
}

/** Shape of ListingDraft.data — a new listing's in-progress form state, autosaved on
 * blur before it's complete enough to become a real Listing/Property row. Every field
 * is optional since the host may have only filled in a few so far. */
export interface ListingDraftData {
  /** Legacy: a step *index*. Reordering LISTING_STEPS changes what a stored index
   *  means, which strands in-flight drafts on the wrong screen — currentStepId is the
   *  one that's written now, and this is only read when that's missing. */
  currentStep?: number;
  currentStepId?: string;
  /**
   * The host-start wizard's own route, and the authority on where a draft resumes.
   *
   * `currentStepId` speaks the eleven-step `LISTING_STEPS` vocabulary the mobile app
   * shares, which has no name for four of this wizard's screens — payment
   * arrangements, availability, house rules and review all collapsed onto one id and
   * resumed on the wrong screen. This field names the screen itself. It is written
   * alongside `currentStepId`, never instead of it, so the mobile app keeps resolving
   * the same draft through the vocabulary it understands.
   */
  currentRoute?: string;
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
  /** Raw V2 field text per method, exactly as the wizard's inputs hold it. */
  paymentDetails?: Partial<Record<PaymentMethodCode, Record<string, string>>>;
  /**
   * The advance-payment and damage-deposit answer, and the draft's own review marker:
   * this field is written only when the host has been shown both questions and given a
   * complete answer to each, which includes explicitly asking for neither.
   *
   * Absent therefore means genuinely unasked — a draft started before the wizard posed
   * the question, or one imported from a provider — and publishing such a draft would
   * freeze `UNANSWERED` deposit terms onto every booking it takes. That is what the
   * Review screen's deposit blocker exists to catch. See
   * `lib/host/v2/listing-deposit-draft.ts`, which owns the conversion in both
   * directions.
   */
  depositPolicies?: ListingDraftDepositPolicies;
  /** Whole days before check-in through which a guest may cancel for a full refund. */
  freeCancellationDaysBeforeCheckIn?: string;
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
  /**
   * Every quiet period, JSON-encoded: `[{"start":"22:00","end":"08:00"}]`.
   *
   * A string like every other draft field, so the one code path that turns a draft into
   * a publish `FormData` keeps working without learning about a second kind of value.
   * Absent on every draft written before periods existed, and on any client that only
   * knows the pair below — which is what that pair is still here for.
   */
  quietHoursPeriods?: string;
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

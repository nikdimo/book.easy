import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  LISTING_STEPS,
  listingStepId,
  resumeListingStep,
} from "@/lib/constants/listing-steps";
import { HOST_START_ROUTES } from "@/lib/host-start-draft";
import {
  DEPOSIT_AMOUNT_TYPE_CODES,
  DEPOSIT_DUE_TIMING_CODES,
} from "@/lib/payments/deposit-policies";
import {
  ADDITIONAL_RULES_MAX,
  EVENT_POLICIES,
  PET_POLICIES,
  QUIET_HOURS_POLICIES,
  SMOKING_POLICIES,
} from "@/lib/host/v2/listing-house-rules";
import type { ListingDraftData } from "@/lib/types/listing-draft";
import { parsePrePublishPlan } from "@/lib/types/listing-prepublish-plan";
import { normalizePropertyType } from "@/lib/types/property-type";
import { PAYMENT_METHOD_CODES } from "@/lib/payments/payment-methods";

const draftString = z.string().max(5000);

/** Any id the wizard currently defines. Unknown ids are rejected rather than
 *  silently stored, so a typo can't strand a draft on a step that doesn't exist. */
const stepIdSchema = z.enum(
  LISTING_STEPS.map((step) => step.id) as [string, ...string[]]
);

/** Any screen of the web wizard. Same reasoning as the step ids above: an unknown
 *  route is refused rather than stored, so a typo cannot strand a resume on a 404. */
const routeSchema = z.enum(HOST_START_ROUTES as unknown as [string, ...string[]]);

/** One deposit section as the wizard's form holds it. Shaped here and nothing more:
 *  whether the amounts and timings are *coherent* is decided once, at publish, by
 *  `validateDepositPolicies` — the same place the listing editor's save decides it.
 *  A draft has to be able to hold a half-typed amount, exactly like every other money
 *  field on it. */
const depositSectionSchema = z.object({
  enabled: z.boolean(),
  amountType: z.enum(DEPOSIT_AMOUNT_TYPE_CODES),
  value: z.string().max(40),
  dueTiming: z.enum(DEPOSIT_DUE_TIMING_CODES),
  dueDaysBeforeCheckIn: z.number().int().min(0).max(3650).nullable(),
});

const mobileListingDraftPatchSchema = z
  .object({
    currentStepId: stepIdSchema.optional(),
    /** The web wizard's own resume position, written alongside the shared step id
     *  rather than instead of it — see `ListingDraftData.currentRoute`. */
    currentRoute: routeSchema.optional(),
    /** Legacy: clients that predate currentStepId send a bare index. It is only
     *  read when no id is present — see the note in parseMobileListingDraftPatch
     *  about why an old index cannot be translated reliably. */
    currentStep: z.number().int().min(0).optional(),
    title: z.string().max(100).optional(),
    description: z.string().max(5000).optional(),
    propertyType: z.string().max(100).optional(),
    spaceType: z.enum(["ENTIRE_PLACE", "PRIVATE_ROOM", "SHARED_ROOM", "HOTEL_ROOM"]).optional(),
    maxGuests: draftString.optional(),
    bedrooms: draftString.optional(),
    beds: draftString.optional(),
    bathrooms: draftString.optional(),
    baseNightlyRate: draftString.optional(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
    cleaningFee: draftString.optional(),
    minNights: draftString.optional(),
    acceptedPaymentMethods: z.array(z.enum(PAYMENT_METHOD_CODES)).max(PAYMENT_METHOD_CODES.length).optional(),
    paymentMethodOther: z.string().max(40).nullable().optional(),
    // Only selected methods have an entry. In Zod 4, `z.record(z.enum(...), ...)`
    // requires every enum key, which made an ordinary partial template object (and
    // even `{}` when the host saved no private details) fail as invalid draft data.
    paymentInstructionTemplates: z
      .partialRecord(z.enum(PAYMENT_METHOD_CODES), z.string().max(1200))
      .optional(),
    // V2 structured details, same partial-record reasoning as the templates above.
    // Field names and values are only shaped here; what a field means and whether its
    // value is a real IBAN is decided by the payment-details validator on publish.
    paymentDetails: z
      .partialRecord(
        z.enum(PAYMENT_METHOD_CODES),
        z.record(z.string().trim().min(1).max(40), z.string().max(500)),
      )
      .optional(),
    // The advance-payment and damage-deposit answer. Both sections are required
    // together because they are one answer: sending half of it would leave the other
    // question in a state that reads as "off" without anyone having said so, and
    // "off" is what publishing writes onto every booking the listing takes.
    depositPolicies: z
      .object({
        // This is a review-time stamp, not a client-selected booking currency. It lets
        // publishing detect that a host entered a fixed amount and later changed the
        // draft's pricing currency instead of silently relabelling that amount.
        currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
        advancePayment: depositSectionSchema,
        damageDeposit: depositSectionSchema.extend({
          returnDaysAfterCheckout: z.number().int().min(0).max(3650).nullable(),
        }),
      })
      .optional(),
    freeCancellationDaysBeforeCheckIn: z.string().max(4).optional(),
    checkInTime: draftString.optional(),
    checkOutTime: draftString.optional(),

    // House rules. The policies are validated as the closed sets they are rather than
    // carried as free text: a value outside them could never be published, and storing
    // it would only move the failure to a screen further along. "" is always allowed —
    // it is how a client says "the host has not answered", which is a real state and
    // the one every listing starts in.
    petPolicy: z.enum(["", ...PET_POLICIES]).optional(),
    smokingPolicy: z.enum(["", ...SMOKING_POLICIES]).optional(),
    eventPolicy: z.enum(["", ...EVENT_POLICIES]).optional(),
    quietHoursPolicy: z.enum(["", ...QUIET_HOURS_POLICIES]).optional(),
    // Times stay loose here, like the arrival pair above: publishing validates them,
    // and an imported off-grid value must survive the round trip rather than being
    // rejected by a draft save.
    quietHoursStart: draftString.optional(),
    quietHoursEnd: draftString.optional(),
    additionalRules: z.string().max(ADDITIONAL_RULES_MAX).optional(),

    amenityIds: z.array(z.string().min(1).max(100)).max(250).optional(),

    // Location, address and Street View. These were previously refused because the
    // mobile client had no screens for them and sent them only by accident; it now
    // owns those steps natively, so refusing them would silently drop the host's
    // work. Every field still has to survive a round trip through the web wizard,
    // which reads the same ListingDraftData shape.
    address: draftString.optional(),
    city: draftString.optional(),
    area: draftString.optional(),
    postalCode: draftString.optional(),
    country: draftString.optional(),
    latitude: draftString.optional(),
    longitude: draftString.optional(),
    locationSource: draftString.optional(),
    locationConfirmed: draftString.optional(),
    geocodingProvider: draftString.optional(),
    geocodingPlaceId: draftString.optional(),
    geocodingConfidence: draftString.optional(),
    streetViewHeading: draftString.optional(),
    streetViewPitch: draftString.optional(),
    streetViewPanoId: draftString.optional(),

    // Photos and video. Order is meaningful — the first image is the cover.
    mediaItems: z
      .array(
        z.object({
          id: z.string().max(100).optional(),
          url: z.string().min(1).max(2000),
          mediaType: z.enum(["IMAGE", "VIDEO"]),
          isPanorama: z.boolean().optional(),
          alt: z.string().max(500).nullish(),
        })
      )
      .max(50)
      .optional(),
    imageUrls: z.array(z.string().min(1).max(2000)).max(50).optional(),

    // Launch offer. The values are validated properly on publish by
    // listing.actions.ts; here they are just carried as draft text.
    promotionType: draftString.optional(),
    promotionPercent: draftString.optional(),
    promotionMinimumNights: draftString.optional(),
    promotionFreeCleaning: draftString.optional(),
    // The shared parser below validates and caps every optional range. Keeping this
    // field in the native draft contract lets the mandatory availability answer
    // survive app restarts without creating a second source of truth.
    prePublishPlan: z.unknown().optional(),
  })
  .strict();

export type MobileListingDraftPatch = z.infer<
  typeof mobileListingDraftPatchSchema
>;

export function parseMobileListingDraftPatch(input: unknown) {
  const parsed = mobileListingDraftPatchSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Invalid listing draft data" } as const;
  }
  const { currentStep, currentStepId, prePublishPlan, ...fields } = parsed.data;

  // The id wins. A bare index from an older client is kept only as a fallback: it
  // was written against that app's own step list, which no longer matches this one,
  // and nothing in the payload says which list it meant. Clamping it lands the host
  // on a plausible screen with all their answers intact, which is the best that
  // ambiguous input allows. Current clients always send the id.
  const position =
    currentStep === undefined && currentStepId === undefined
      ? undefined
      : resumeListingStep(currentStepId, currentStep);

  return {
    data: {
      ...fields,
      ...(prePublishPlan === undefined
        ? {}
        : { prePublishPlan: parsePrePublishPlan(prePublishPlan) }),
      // Both are written so the web wizard resumes correctly whichever it reads.
      ...(position === undefined
        ? {}
        : { currentStep: position, currentStepId: listingStepId(position) }),
    },
  } as const;
}

export function mergeMobileListingDraft(
  existing: Prisma.JsonValue | null | undefined,
  patch: MobileListingDraftPatch
): Prisma.InputJsonValue {
  const current =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? existing
      : {};

  // A patch carries only the fields the client actually touched, so spreading it
  // over the stored JSON leaves everything else — including whatever the web wizard
  // wrote — intact. Sending `mediaItems` replaces the array wholesale, which is what
  // reordering and removal need; there is no per-item merge to get wrong.
  return { ...current, ...patch } as Prisma.InputJsonValue;
}

export function listingDraftData(value: Prisma.JsonValue): ListingDraftData {
  const data = (
    value && typeof value === "object" && !Array.isArray(value) ? value : {}
  ) as ListingDraftData;

  // Drafts written before ordered media items existed carry only `imageUrls`. Host V2
  // and publishing both read `mediaItems`, so normalize genuinely legacy rows on read.
  // When `mediaItems` exists it remains authoritative, even when it is intentionally
  // empty; the parallel legacy list must not resurrect a removed photo.
  const legacyMediaItems =
    data.mediaItems === undefined && Array.isArray(data.imageUrls)
      ? [...new Set(data.imageUrls)].map((url) => ({
          url,
          mediaType: "IMAGE" as const,
          alt: null,
        }))
      : undefined;

  return {
    ...data,
    ...(legacyMediaItems === undefined ? {} : { mediaItems: legacyMediaItems }),
    ...(data.prePublishPlan === undefined
      ? {}
      : { prePublishPlan: parsePrePublishPlan(data.prePublishPlan) }),
    ...(data.propertyType === undefined
      ? {}
      : { propertyType: normalizePropertyType(data.propertyType) }),
  };
}

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  LISTING_STEPS,
  listingStepId,
  resumeListingStep,
} from "@/lib/constants/listing-steps";
import type { ListingDraftData } from "@/lib/types/listing-draft";
import { parsePrePublishPlan } from "@/lib/types/listing-prepublish-plan";
import { normalizePropertyType } from "@/lib/types/property-type";

const draftString = z.string().max(5000);

/** Any id the wizard currently defines. Unknown ids are rejected rather than
 *  silently stored, so a typo can't strand a draft on a step that doesn't exist. */
const stepIdSchema = z.enum(
  LISTING_STEPS.map((step) => step.id) as [string, ...string[]]
);

const mobileListingDraftPatchSchema = z
  .object({
    currentStepId: stepIdSchema.optional(),
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
    cleaningFee: draftString.optional(),
    minNights: draftString.optional(),
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

  return {
    ...data,
    ...(data.prePublishPlan === undefined
      ? {}
      : { prePublishPlan: parsePrePublishPlan(data.prePublishPlan) }),
    ...(data.propertyType === undefined
      ? {}
      : { propertyType: normalizePropertyType(data.propertyType) }),
  };
}

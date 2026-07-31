import type { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  LISTING_STEPS,
  listingStepId,
  resumeListingStep,
} from "@/lib/constants/listing-steps";
import type { ListingDraftData } from "@/lib/types/listing-draft";

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
    maxGuests: draftString.optional(),
    bedrooms: draftString.optional(),
    beds: draftString.optional(),
    bathrooms: draftString.optional(),
    baseNightlyRate: draftString.optional(),
    cleaningFee: draftString.optional(),
    minNights: draftString.optional(),
    amenityIds: z.array(z.string().min(1).max(100)).max(250).optional(),
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
  const { currentStep, currentStepId, ...fields } = parsed.data;

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

  // Only the stable native fields are present in `patch`. Spreading them over the
  // existing JSON deliberately retains web-owned location and media fields.
  return { ...current, ...patch } as Prisma.InputJsonValue;
}

export function listingDraftData(value: Prisma.JsonValue): ListingDraftData {
  return (
    value && typeof value === "object" && !Array.isArray(value) ? value : {}
  ) as ListingDraftData;
}

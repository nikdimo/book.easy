import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizeListingStep } from "@/lib/constants/listing-steps";
import type { ListingDraftData } from "@/lib/types/listing-draft";

const draftString = z.string().max(5000);

const mobileListingDraftPatchSchema = z
  .object({
    currentStep: z.number().int().min(0).max(6).optional(),
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
  return {
    data: {
      ...parsed.data,
      ...(parsed.data.currentStep === undefined
        ? {}
        : { currentStep: normalizeListingStep(parsed.data.currentStep) }),
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

"use server";

import type { ListingMediaType, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listingFormSchema, type ListingFormInput } from "@/lib/validations/listing.schema";
import { generateUniqueSlug, archiveOrDeleteListing } from "@/lib/services/listing.service";
import { enqueueUploadDeletions, sweepUploads } from "@/lib/storage/upload-cleanup";
import { deleteOwnedListingDraftWithCleanup } from "@/lib/listing-draft-cleanup";
import { seedListingRooms } from "@/lib/rooms/counted-rooms";
import { revalidatePublicListingCaches } from "@/lib/utils/revalidate-public-listing-caches";
import { revalidatePath } from "next/cache";
import { firstZodMessage } from "@/lib/utils/zod-error";
import { isShortMapsLink, parseCoordsFromMapsText } from "@/lib/utils/parse-maps-link";
import type { ListingMediaItem } from "@/lib/types/listing-media";
import {
  listingStepId,
  normalizeListingStep,
} from "@/lib/constants/listing-steps";
import {
  DEFAULT_BLOCK_REASON,
  flattenPlanDatePrices,
  mergeInclusiveBlockRanges,
  parsePlanDate,
  parsePrePublishPlan,
  planOfferToPromotion,
  planRangeToAvailabilityBlock,
  planRangeToDbRange,
  type InclusiveBlockRange,
} from "@/lib/types/listing-prepublish-plan";
import {
  AVAILABILITY_START_BLOCK_REASON,
  availabilityStartBlock,
  validateAvailabilityStartForPublish,
  validateStoredListingAvailabilityForPublish,
} from "@/lib/types/listing-availability-start";
import { getExchangeRates } from "@/lib/currency/rates";
import { MIN_PUBLISH_PHOTOS } from "@/lib/host/v2/photo-draft";
import { normalizeQuietHoursPeriods } from "@/lib/host/v2/listing-house-rules";
import { validateListingPaymentMethods } from "@/lib/payments/payment-methods";
import {
  validateDepositPolicies,
  type DepositPoliciesConfig,
} from "@/lib/payments/deposit-policies";
import {
  depositPoliciesDraftMatchesCurrency,
  depositPoliciesPayload,
  parseDepositPoliciesDraft,
} from "@/lib/host/v2/listing-deposit-draft";
import {
  paymentInstructionStoreSnapshot,
  validatePaymentInstructionTemplates,
  validatePaymentMethodDetailsMap,
} from "@/lib/payments/payment-instruction-templates";
import { validateCancellationPolicy } from "@/lib/payments/cancellation-policy";
import { actionText } from "@/lib/actions/action-text";
import {
  archiveOwnedListing,
  unpublishOwnedListing,
} from "@/lib/services/listing-lifecycle.service";

async function currencyIsCurrentlyQuotable(currency: string): Promise<boolean> {
  const rates = await getExchangeRates();
  return currency === "EUR" || Boolean(rates?.rates[currency]);
}

/**
 * Silently persists a new listing's in-progress form state before it's complete enough
 * to satisfy the real Property/Listing schema (title length, required fields, etc.) —
 * see ListingDraft in schema.prisma for why this is a separate table rather than
 * relaxing those columns. Called on field blur while filling out a new listing; not
 * validated at all, since partial/empty values are expected.
 */
function draftDataFromForm(formData: FormData): Prisma.InputJsonValue {
  const str = (key: string) => {
    const v = formData.get(key);
    return typeof v === "string" ? v : "";
  };

  return {
    currentStep: normalizeListingStep(str("currentStep")),
    currentStepId: listingStepId(normalizeListingStep(str("currentStep"))),
    title: str("title"),
    description: str("description"),
    propertyType: str("propertyType"),
    spaceType: str("spaceType") || "ENTIRE_PLACE",
    address: str("address"),
    city: str("city"),
    area: str("area"),
    postalCode: str("postalCode"),
    country: str("country"),
    latitude: str("latitude"),
    longitude: str("longitude"),
    locationSource: str("locationSource"),
    locationConfirmed: str("locationConfirmed"),
    geocodingProvider: str("geocodingProvider"),
    geocodingPlaceId: str("geocodingPlaceId"),
    geocodingConfidence: str("geocodingConfidence"),
    streetViewHeading: str("streetViewHeading"),
    streetViewPitch: str("streetViewPitch"),
    streetViewPanoId: str("streetViewPanoId"),
    maxGuests: str("maxGuests"),
    bedrooms: str("bedrooms"),
    bathrooms: str("bathrooms"),
    beds: str("beds"),
    currency: str("currency") || "EUR",
    baseNightlyRate: str("baseNightlyRate"),
    cleaningFee: str("cleaningFee"),
    minNights: str("minNights"),
    freeCancellationDaysBeforeCheckIn: str(
      "freeCancellationDaysBeforeCheckIn",
    ),
    checkInTime: str("checkInTime"),
    checkOutTime: str("checkOutTime"),
    petPolicy: str("petPolicy"),
    smokingPolicy: str("smokingPolicy"),
    eventPolicy: str("eventPolicy"),
    quietHoursPolicy: str("quietHoursPolicy"),
    quietHoursStart: str("quietHoursStart"),
    quietHoursEnd: str("quietHoursEnd"),
    additionalRules: str("additionalRules"),
    promotionType: str("promotionType"),
    promotionPercent: str("promotionPercent"),
    promotionMinimumNights: str("promotionMinimumNights"),
    promotionFreeCleaning: str("promotionFreeCleaning"),
    mediaItems: parseMediaItemsFromForm(formData) as unknown as Prisma.InputJsonValue,
    amenityIds: formData.getAll("amenityIds").filter((v): v is string => typeof v === "string"),
    // Normalised on the way in as well as at publish: a draft resumed on another
    // device should not be able to reintroduce entries publish would reject.
    prePublishPlan: parsePrePublishPlan(
      str("prePublishPlan")
    ) as unknown as Prisma.InputJsonValue,
  } as Prisma.InputJsonValue;
}

export async function saveListingDraft(
  draftId: string | null,
  formData: FormData
): Promise<{ draftId: string | null } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: await actionText("action.error.not_authorized", "Not authorized") };
  }

  const jsonData = draftDataFromForm(formData);

  // Nothing is worth remembering until the host leaves the first step: opening
  // /host/listings/new and walking away would otherwise litter My listings with
  // empty "stopped at step 1" drafts. An existing draft still gets updated, even
  // if the host steps back to the first screen.
  if (!draftId && normalizeListingStep(formData.get("currentStep")) === 0) {
    return { draftId: null };
  }

  if (draftId) {
    const existing = await db.listingDraft.findFirst({
      where: { id: draftId, hostId: session.user.id },
      select: { id: true },
    });
    if (!existing) return { error: await actionText("action.error.draft_not_found", "Draft not found") };
    await db.listingDraft.update({ where: { id: draftId }, data: { data: jsonData } });
    return { draftId };
  }

  const created = await db.listingDraft.create({
    data: { hostId: session.user.id, data: jsonData },
  });
  return { draftId: created.id };
}

export async function deleteListingDraft(draftId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: await actionText("action.error.not_authorized", "Not authorized") };

  // Ownership is still the caller's own `hostId` — this is not an admin path and never
  // was. The shared operation adds the part that was missing: the draft's uploaded photos
  // are unlinked once the row is gone and nothing else references them.
  const result = await deleteOwnedListingDraftWithCleanup({
    hostId: session.user.id,
    draftId,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/host/listings");
  revalidatePath("/host/listings");
  return { success: true };
}

/**
 * Short Google Maps links (goo.gl) don't carry coordinates until resolved — the pin
 * lives in the redirect chain, not the short URL itself. Resolves server-side (fetch
 * follows redirects) and only ever accepts a goo.gl host to avoid this becoming an
 * open SSRF proxy for arbitrary hosts.
 */
export async function resolveMapsLink(
  url: string
): Promise<{ lat: number; lng: number } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: await actionText("action.error.not_authorized", "Not authorized") };

  const direct = parseCoordsFromMapsText(url);
  if (direct) return direct;

  if (!isShortMapsLink(url)) {
    return { error: await actionText("action.error.link_no_coordinates", "Couldn't find coordinates in that link") };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url.trim(), { redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);
    const resolved = parseCoordsFromMapsText(res.url);
    if (resolved) return resolved;
    return { error: await actionText("action.error.link_no_coordinates", "Couldn't find coordinates in that link") };
  } catch {
    return { error: await actionText("action.error.link_unresolved", "Couldn't resolve that link") };
  }
}

function isValidUploadUrl(url: string): boolean {
  const t = url.trim();
  return t.length > 0 && (t.startsWith("/") || t.startsWith("https://") || t.startsWith("http://"));
}

function parseLegacyImageUrlsFromForm(formData: FormData): ListingMediaItem[] {
  return formData
    .getAll("imageUrls")
    .filter((v): v is string => typeof v === "string")
    .map((url) => url.trim())
    .filter(isValidUploadUrl)
    .map((url) => ({ url, mediaType: "IMAGE" }));
}

function parseMediaItemsFromForm(formData: FormData): ListingMediaItem[] {
  const raw = formData.getAll("mediaItems").filter((v): v is string => typeof v === "string");
  if (raw.length === 0) {
    return parseLegacyImageUrlsFromForm(formData);
  }

  return raw.flatMap((value) => {
    try {
      const parsed = JSON.parse(value) as {
        url?: unknown;
        mediaType?: unknown;
        isPanorama?: unknown;
      };
      const url = typeof parsed.url === "string" ? parsed.url.trim() : "";
      const mediaType = parsed.mediaType === "VIDEO" ? "VIDEO" : parsed.mediaType === "IMAGE" ? "IMAGE" : null;
      if (!mediaType || !isValidUploadUrl(url)) return [];
      return [{ url, mediaType, isPanorama: mediaType === "IMAGE" && parsed.isPanorama === true }];
    } catch {
      return [];
    }
  });
}

function firstImageIndex(mediaItems: ListingMediaItem[]): number {
  return mediaItems.findIndex((item) => item.mediaType === "IMAGE");
}

/**
 * The structured house rules, from a parsed form to the columns that hold them.
 *
 * NULL for every unanswered policy, and — as with the arrival times — never `false`.
 * A listing published by a client that has no rules screen yet has said nothing about
 * smoking, and saying nothing is what the row must record.
 *
 * Quiet-hours times are dropped unless the policy is SET, so a draft that once had
 * times and was later switched to "no quiet hours" cannot publish a rule its host
 * turned off.
 *
 * `storedPeriods` is the listing's existing `quietHoursPeriods`, and only an edit has
 * one. This form has a single pair of controls and no idea a listing may declare several
 * quiet periods, so it must never *narrow* one down to the range it happens to know
 * about: on an edit the stored list is carried through untouched, and on a create there
 * is nothing to carry and the pair it posted is the whole rule.
 */
function houseRulesCreateData(data: ListingFormInput, storedPeriods?: unknown) {
  const quietHours = data.quietHoursPolicy === "SET";
  return {
    petPolicy: data.petPolicy,
    smokingPolicy: data.smokingPolicy,
    eventPolicy: data.eventPolicy,
    quietHoursPolicy: data.quietHoursPolicy,
    // What the submission carried, then what the listing already had, then the pair.
    // A create posts the list the host built in the flow; an edit posts none, and the
    // stored list is what must survive a form that cannot show it.
    quietHoursPeriods: quietHours
      ? normalizeQuietHoursPeriods(data.quietHoursPeriods ?? storedPeriods, {
          start: data.quietHoursStart,
          end: data.quietHoursEnd,
        })
      : [],
    quietHoursStart: quietHours ? data.quietHoursStart || null : null,
    quietHoursEnd: quietHours ? data.quietHoursEnd || null : null,
    additionalRules: data.additionalRules || null,
  };
}

/**
 * Creates a new listing and publishes it immediately — there's no intermediate
 * "created but not submitted" state a real Listing row can be in; that's what
 * ListingDraft (see saveListingDraft above) is for, before this is called. Sets
 * `needsReview` so it still surfaces in the admin review queue after going live.
 * Deletes the originating draft row on success, since its job is done. Returns rather
 * than redirecting so the caller can show a confirmation dialog first.
 */
export async function submitNewListing(
  formData: FormData,
  draftId?: string | null
): Promise<
  { error: string } | { success: true; listingId: string; slug: string }
> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: await actionText("action.error.not_authorized", "Not authorized") };
  }

  const raw = {
    title: formData.get("title"),
    description: formData.get("description"),
    propertyType: formData.get("propertyType"),
    spaceType: formData.get("spaceType") || "ENTIRE_PLACE",
    address: formData.get("address"),
    city: formData.get("city"),
    area: formData.get("area") || undefined,
    postalCode: formData.get("postalCode") || undefined,
    country: formData.get("country"),
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
    locationSource: formData.get("locationSource") || undefined,
    locationConfirmed: formData.get("locationConfirmed"),
    geocodingProvider: formData.get("geocodingProvider") || undefined,
    geocodingPlaceId: formData.get("geocodingPlaceId") || undefined,
    geocodingConfidence: formData.get("geocodingConfidence") || undefined,
    streetViewHeading: formData.get("streetViewHeading") || undefined,
    streetViewPitch: formData.get("streetViewPitch") || undefined,
    streetViewPanoId: formData.get("streetViewPanoId") || undefined,
    maxGuests: formData.get("maxGuests"),
    bedrooms: formData.get("bedrooms"),
    bathrooms: formData.get("bathrooms"),
    beds: formData.get("beds"),
    currency: formData.get("currency") || "EUR",
    baseNightlyRate: formData.get("baseNightlyRate"),
    cleaningFee: formData.get("cleaningFee") || "0",
    minNights: formData.get("minNights") || "1",
    checkInTime: formData.get("checkInTime") || undefined,
    checkOutTime: formData.get("checkOutTime") || undefined,
    petPolicy: formData.get("petPolicy") || undefined,
    smokingPolicy: formData.get("smokingPolicy") || undefined,
    eventPolicy: formData.get("eventPolicy") || undefined,
    quietHoursPolicy: formData.get("quietHoursPolicy") || undefined,
    quietHoursPeriods: formData.get("quietHoursPeriods") || undefined,
    quietHoursStart: formData.get("quietHoursStart") || undefined,
    quietHoursEnd: formData.get("quietHoursEnd") || undefined,
    additionalRules: formData.get("additionalRules") || undefined,
    promotionType: formData.get("promotionType") || "NONE",
    promotionPercent: formData.get("promotionPercent") || "15",
    promotionMinimumNights: formData.get("promotionMinimumNights") || "5",
    promotionFreeCleaning: formData.get("promotionFreeCleaning"),
    amenityIds: formData.getAll("amenityIds"),
  };

  const parsed = listingFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: firstZodMessage(parsed.error) };
  }

  const data = parsed.data;
  const paymentMethodValues = formData.getAll("acceptedPaymentMethods");
  // The current host-start wizard always sends this field and requires an answer.
  // Older web/mobile publishers do not know about the payment step yet, so keep
  // their listing publishable and let the existing "missing payment setup" task
  // collect the answer afterward.
  const hasPaymentMethodAnswer = formData.has("acceptedPaymentMethods");
  const paymentMethods = hasPaymentMethodAnswer
    ? validateListingPaymentMethods({
        methods: paymentMethodValues,
        otherLabel: formData.get("paymentMethodOther"),
      })
    : null;
  if (paymentMethods && !paymentMethods.success) {
    return { error: await actionText("action.error.payment_methods_required", "Choose at least one accepted payment method before publishing.") };
  }
  let validatedTemplates: ReturnType<typeof validatePaymentInstructionTemplates> | null = null;
  let validatedDetails: ReturnType<typeof validatePaymentMethodDetailsMap> | null = null;
  if (paymentMethods?.success) {
    let instructionTemplates: unknown = {};
    try {
      instructionTemplates = JSON.parse(
        String(formData.get("paymentInstructionTemplates") ?? "{}"),
      );
    } catch {
      return { error: await actionText("action.error.payment_instructions_review", "Review the saved private payment instructions.") };
    }
    validatedTemplates = validatePaymentInstructionTemplates(
      instructionTemplates,
      paymentMethods.value.methods,
    );
    if (!validatedTemplates.success) {
      return { error: await actionText("action.error.payment_instructions_review", "Review the saved private payment instructions.") };
    }

    let paymentDetails: unknown = {};
    try {
      paymentDetails = JSON.parse(String(formData.get("paymentDetails") ?? "{}"));
    } catch {
      return { error: await actionText("action.error.payment_details_review", "Review the saved private payment details.") };
    }
    validatedDetails = validatePaymentMethodDetailsMap(
      paymentDetails,
      paymentMethods.value.methods,
    );
    if (!validatedDetails.success) {
      // Deliberately generic: this string can be rendered and logged, and the values
      // behind the failure are private financial data.
      return { error: await actionText("action.error.payment_details_review", "Review the saved private payment details.") };
    }
  }
  /*
   * The deposit answer, when the publisher had a screen to ask it on.
   *
   * Absent is a real state, not a missing field: the mobile app and the classic wizard
   * do not ask, and their listings stay publishable with `depositPoliciesReviewedAt`
   * null so the host's Today list collects the answer afterwards. The current wizard
   * always sends it, which is what stops a freshly published listing from freezing
   * `UNANSWERED` deposit terms onto its first booking and raising an "incomplete
   * payment arrangements" task pointing back at a screen the host just finished.
   *
   * The currency is the listing's own, exactly as `saveListingDepositPolicies` takes it
   * from the pricing rule. A percentage resolved against a total in one currency and
   * labelled with another is the drift that rule exists to prevent, and this is the one
   * moment where the two are guaranteed to agree.
   */
  const rawDepositPolicies = formData.get("depositPolicies");
  let depositPolicies: DepositPoliciesConfig | null = null;
  if (typeof rawDepositPolicies === "string" && rawDepositPolicies.trim() !== "") {
    let parsedDepositPolicies: unknown;
    try {
      parsedDepositPolicies = JSON.parse(rawDepositPolicies);
    } catch {
      return { error: await actionText("action.error.deposit_settings_review", "Review your advance payment and damage deposit settings.") };
    }
    const draft = parseDepositPoliciesDraft(parsedDepositPolicies);
    if (!draft) {
      return { error: await actionText("action.error.deposit_settings_review", "Review your advance payment and damage deposit settings.") };
    }
    if (!depositPoliciesDraftMatchesCurrency(draft, data.currency)) {
      return { error: await actionText(
        "action.error.deposit_currency_review",
        "Review the advance payment and damage deposit amounts after changing the listing currency.",
      ) };
    }
    const validation = validateDepositPolicies(
      depositPoliciesPayload(draft, data.currency),
    );
    if (!validation.success) {
      return { error: await actionText("action.error.deposit_invalid", "Check the deposit amounts and timing before publishing.") };
    }
    depositPolicies = validation.value;
  }

  const cancellationPolicy = validateCancellationPolicy(
    formData.get("freeCancellationDaysBeforeCheckIn"),
  );
  if (!cancellationPolicy.success) {
    return cancellationPolicy.issue === "REQUIRED"
      ? { error: await actionText(
          "action.error.cancellation_deadline_required",
          "Choose the free-cancellation deadline before publishing.",
        ) }
      : { error: await actionText(
          "action.error.cancellation_days_range",
          "Free-cancellation days must be a whole number from 0 to 3650.",
        ) };
  }

  if (!(await currencyIsCurrentlyQuotable(data.currency))) {
    return { error: await actionText("action.error.currency_unavailable", "That currency is not currently available. Choose another currency.") };
  }
  const promotionType =
    raw.promotionType === "PERCENT_DISCOUNT" ||
    raw.promotionType === "FREE_CLEANING"
      ? raw.promotionType
      : "NONE";
  const promotionPercent = Number(raw.promotionPercent);
  const promotionMinimumNights = Number(raw.promotionMinimumNights);
  /** The two benefits compose, so free cleaning is its own flag rather than a
   *  third promotionType. Clients that predate the flag (the mobile app) send
   *  only the type, and "FREE_CLEANING" keeps meaning what it always did. */
  const promotionFreeCleaning =
    raw.promotionFreeCleaning === "true" || promotionType === "FREE_CLEANING";
  if (
    promotionType === "PERCENT_DISCOUNT" &&
    (!Number.isInteger(promotionPercent) ||
      promotionPercent < 5 ||
      promotionPercent > 50)
  ) {
    return { error: await actionText("action.error.promotion_discount_range", "Choose a discount between 5% and 50%.") };
  }
  if (
    promotionType !== "NONE" &&
    (!Number.isInteger(promotionMinimumNights) ||
      promotionMinimumNights < 1 ||
      promotionMinimumNights > 365)
  ) {
    return { error: await actionText("action.error.promotion_min_stay_range", "Promotion minimum stay must be between 1 and 365 nights.") };
  }
  if (promotionFreeCleaning && data.cleaningFee <= 0) {
    return { error: await actionText("action.error.free_cleaning_needs_fee", "Add a cleaning fee before offering free cleaning.") };
  }
  const mediaItems = parseMediaItemsFromForm(formData);
  const primaryImageIndex = firstImageIndex(mediaItems);
  if (mediaItems.filter((item) => item.mediaType === "IMAGE").length < MIN_PUBLISH_PHOTOS) {
    return {
      error: await actionText(
        "action.error.photos_minimum",
        "Add at least {count} photos before publishing",
        { count: MIN_PUBLISH_PHOTOS },
      ),
    };
  }

  // Everything the host optionally set up on the last screen. Re-parsed rather than
  // trusted: this arrives as a form field like any other. Invalid entries are dropped,
  // never fatal — losing a finished listing over an optional date range would be a
  // worse outcome than publishing without that range.
  const plan = parsePrePublishPlan(formData.get("prePublishPlan"));

  // Availability is the one part of the plan that is required, so unlike the optional
  // ranges above it fails the publish instead of being dropped. Checked here and not
  // only behind a disabled button: this action is reachable directly, and a listing
  // that goes live bookable-from-today because nobody answered is the failure the
  // screen exists to prevent. An unparseable answer is never read as "available now".
  const availability = validateAvailabilityStartForPublish(plan.availabilityStart);
  if (!availability.ok) {
    if (availability.reason === "past-date") {
      return { error: await actionText(
        "action.error.availability_start_past",
        "That availability start date has already passed. Choose today or a later date.",
      ) };
    }
    if (availability.reason === "invalid-date") {
      return { error: await actionText("action.error.availability_start_invalid", "Choose a valid date for when guests can start booking.") };
    }
    return { error: await actionText("action.error.availability_start_required", "Confirm when guests can start booking before publishing.") };
  }

  // The same rule the launch offer follows: free cleaning on a listing with no cleaning
  // fee is not an offer, it's a no-op the guest would see as a lie. Only that benefit is
  // dropped — an offer that also discounts the nights still stands.
  const datedOffers = plan.offers
    .map((offer) =>
      offer.freeCleaning && data.cleaningFee <= 0
        ? { ...offer, freeCleaning: false }
        : offer
    )
    .filter((offer) => offer.discountPercent > 0 || offer.freeCleaning);
  const datePriceRows = flattenPlanDatePrices(plan.datePrices);

  // One list: the launch offer (by length of stay, no dates) and the host's dated
  // offers are the same kind of row and the quote engine already picks between them —
  // date-specific first, then the highest qualifying minimum-night threshold.
  const promotionCreates: Prisma.ListingPromotionCreateWithoutListingInput[] = [];
  if (promotionType !== "NONE") {
    promotionCreates.push({
      type: promotionType,
      discountPercent:
        promotionType === "PERCENT_DISCOUNT" ? promotionPercent : 0,
      minimumNights: promotionMinimumNights,
      freeCleaning: promotionFreeCleaning,
      roundToWholeUnit: promotionType === "PERCENT_DISCOUNT",
    });
  }
  for (const offer of datedOffers) {
    const promotion = planOfferToPromotion(offer);
    if (promotion) promotionCreates.push(promotion);
  }

  // Two independent sources of blocked nights: "available from" (everything before the
  // start date) and the ranges the host painted. They can cover the same nights, and
  // AvailabilityBlock's exclusion constraint rejects overlapping rows — so they are
  // merged as inclusive ranges first and converted to the database's exclusive end
  // exactly once each. "Available now" contributes nothing, leaving this the plain list
  // of the host's own blocks.
  //
  // The start block is listed first on purpose: it always begins today, so the reason
  // rule in mergeInclusiveBlockRanges (earliest start wins) keeps its wording for any
  // span it gets merged into.
  const startBlock = availabilityStartBlock(availability.value);
  const inclusiveBlockRanges: InclusiveBlockRange[] = [
    ...(startBlock
      ? [{ ...startBlock, reason: AVAILABILITY_START_BLOCK_REASON }]
      : []),
    ...plan.blocks.map((block) => ({ ...block, reason: DEFAULT_BLOCK_REASON })),
  ];

  const availabilityBlockCreates = mergeInclusiveBlockRanges(
    inclusiveBlockRanges
  ).flatMap((range) => {
    const availabilityBlock = planRangeToAvailabilityBlock(range, range.reason);
    return availabilityBlock ? [availabilityBlock] : [];
  });

  const availabilityWindowCreates = mergeInclusiveBlockRanges(
    plan.openDates.map((range) => ({ ...range, reason: "Open before publishing" })),
  ).flatMap((range) => {
    const window = planRangeToDbRange(range);
    return window ? [window] : [];
  });

  const datePriceCreates = datePriceRows.flatMap((row) => {
    const date = parsePlanDate(row.date);
    return date ? [{ date, nightlyRate: row.nightlyRate }] : [];
  });

  const slug = await generateUniqueSlug(data.title);

  const property = await db.property.create({
    data: {
      ownerId: session.user.id,
      name: data.title,
      propertyType: data.propertyType,
      address: data.address,
      city: data.city,
      area: data.area,
      postalCode: data.postalCode,
      country: data.country,
      latitude: data.latitude,
      longitude: data.longitude,
      locationSource: data.locationSource,
      geocodingProvider: data.geocodingProvider,
      geocodingPlaceId: data.geocodingPlaceId,
      geocodingConfidence: data.geocodingConfidence,
      streetViewHeading: data.streetViewHeading,
      streetViewPitch: data.streetViewPitch,
      streetViewPanoId: data.streetViewPanoId,
    },
  });

  const listing = await db.listing.create({
    data: {
      propertyId: property.id,
      hostId: session.user.id,
      title: data.title,
      slug,
      description: data.description,
      spaceType: data.spaceType,
      status: "APPROVED",
      availabilityMode:
        availability.value.mode === "selected" ? "CLOSED" : "OPEN",
      needsReview: true,
      approvedAt: new Date(),
      publishedAt: new Date(),
      maxGuests: data.maxGuests,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      beds: data.beds,
      ...(paymentMethods?.success &&
      validatedTemplates?.success &&
      validatedDetails?.success
        ? {
            acceptedPaymentMethods: paymentMethods.value.methods,
            paymentMethodOther: paymentMethods.value.otherLabel,
            paymentMethodsReviewedAt: new Date(),
            paymentInstructionTemplates: paymentInstructionStoreSnapshot({
              templates: validatedTemplates.value,
              details: validatedDetails.value,
            }) as unknown as Prisma.InputJsonObject,
          }
        : {}),
      // Written only when the host was asked. Every column here has a schema default
      // that already says "no deposit"; what a publisher without the screen must not
      // get is `depositPoliciesReviewedAt`, because that marker is the whole difference
      // between a host who chose to ask for nothing and one who was never asked.
      ...(depositPolicies
        ? {
            advancePaymentEnabled: depositPolicies.advancePayment !== null,
            advancePaymentType: depositPolicies.advancePayment?.amountType ?? null,
            advancePaymentValue: depositPolicies.advancePayment?.value ?? null,
            advancePaymentDueTiming:
              depositPolicies.advancePayment?.dueTiming ?? "AFTER_ACCEPTANCE",
            advancePaymentDueDaysBeforeCheckIn:
              depositPolicies.advancePayment?.dueDaysBeforeCheckIn ?? null,
            damageDepositEnabled: depositPolicies.damageDeposit !== null,
            damageDepositType: depositPolicies.damageDeposit?.amountType ?? null,
            damageDepositValue: depositPolicies.damageDeposit?.value ?? null,
            damageDepositDueTiming:
              depositPolicies.damageDeposit?.dueTiming ?? "AFTER_ACCEPTANCE",
            damageDepositDueDaysBeforeCheckIn:
              depositPolicies.damageDeposit?.dueDaysBeforeCheckIn ?? null,
            damageDepositReturnDaysAfterCheckout:
              depositPolicies.damageDeposit?.returnDaysAfterCheckout ?? null,
            // Null when nothing is charged, so a listing that asks for neither keeps no
            // stale quote — the same rule `saveListingDepositPolicies` applies.
            depositPoliciesCurrency:
              depositPolicies.advancePayment || depositPolicies.damageDeposit
                ? data.currency
                : null,
            depositPoliciesReviewedAt: new Date(),
          }
        : {}),
      freeCancellationDaysBeforeCheckIn: cancellationPolicy.value,
      cancellationPolicyReviewedAt: new Date(),
      // "" is the host choosing to stay flexible; null is how that reads everywhere it
      // is displayed, so the empty string never reaches the database.
      checkInTime: data.checkInTime || null,
      checkOutTime: data.checkOutTime || null,
      ...houseRulesCreateData(data),
      pricingRule: {
        create: {
          currency: data.currency,
          baseNightlyRate: data.baseNightlyRate,
          cleaningFee: data.cleaningFee,
          minNights: data.minNights,
        },
      },
      ...(promotionCreates.length > 0
        ? { promotions: { create: promotionCreates } }
        : {}),
      // Nested in the same create as the listing, so a host who blocked their own
      // holiday dates never has a window where the listing is live and bookable on
      // days they just said they were using it.
      ...(availabilityBlockCreates.length > 0
        ? { availabilityBlocks: { create: availabilityBlockCreates } }
        : {}),
      ...(availabilityWindowCreates.length > 0
        ? { availabilityWindows: { create: availabilityWindowCreates } }
        : {}),
      ...(datePriceCreates.length > 0
        ? { datePrices: { create: datePriceCreates } }
        : {}),
      ...(data.amenityIds && data.amenityIds.length > 0
        ? {
            amenities: {
              create: data.amenityIds.map((amenityId) => ({ amenityId })),
            },
          }
        : {}),
      images: {
        create: mediaItems.map((item, i) => ({
          url: item.url,
          mediaType: item.mediaType as ListingMediaType,
          isPanorama: item.mediaType === "IMAGE" && item.isPanorama === true,
          displayOrder: i,
          isPrimary: i === primaryImageIndex,
        })),
      },
    },
  });

  // The wizard asks for bedroom and bathroom counts as numbers; the editor works in
  // rooms. Turning the answer into real rooms here is what stops a freshly published
  // listing from opening Photos with an empty rail and no sign that rooms exist.
  try {
    await seedListingRooms(db, listing.id, {
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
    });
  } catch (error) {
    // A missing or renamed room type must not fail a publish that has already written
    // the listing. The host can still add rooms by hand, and the backfill picks it up.
    console.error("[listing] room seeding failed", listing.id, error);
  }

  if (draftId) {
    // The listing now owns the photos the draft was holding, so the reference check keeps
    // every one it carried across. What it does clean up is whatever the draft collected
    // and publish did not take — the same shared path as every other draft deletion, so
    // there is no second set of rules for the one that happens on success.
    await deleteOwnedListingDraftWithCleanup({ hostId: session.user.id, draftId });
  }

  revalidatePath("/host/listings");
  revalidatePath("/host/listings");
  revalidatePublicListingCaches();
  return { success: true, listingId: listing.id, slug: listing.slug };
}

export async function updateListing(listingId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: await actionText("action.error.not_authorized", "Not authorized") };
  }

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    include: { property: true, pricingRule: true },
  });
  if (!listing) return { error: await actionText("action.error.listing_not_found", "Listing not found") };
  if (!listing.pricingRule) {
    return { error: await actionText("action.error.pricing_required_changes", "Set pricing before publishing listing changes.") };
  }

  const raw = {
    title: formData.get("title"),
    description: formData.get("description"),
    propertyType: formData.get("propertyType"),
    spaceType: formData.get("spaceType") || listing.spaceType,
    address: formData.get("address"),
    city: formData.get("city"),
    area: formData.get("area") || undefined,
    postalCode: formData.get("postalCode") || undefined,
    country: formData.get("country"),
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
    locationSource: formData.get("locationSource") || undefined,
    locationConfirmed: formData.get("locationConfirmed"),
    geocodingProvider: formData.get("geocodingProvider") || undefined,
    geocodingPlaceId: formData.get("geocodingPlaceId") || undefined,
    geocodingConfidence: formData.get("geocodingConfidence") || undefined,
    streetViewHeading: formData.get("streetViewHeading") || undefined,
    streetViewPitch: formData.get("streetViewPitch") || undefined,
    streetViewPanoId: formData.get("streetViewPanoId") || undefined,
    maxGuests: formData.get("maxGuests"),
    bedrooms: formData.get("bedrooms"),
    bathrooms: formData.get("bathrooms"),
    beds: formData.get("beds"),
    // Currency is the unit for every stored price on the listing, including date
    // overrides and fixed-amount promotions. Changing only this label would silently
    // re-denominate those amounts, so detail edits must preserve the persisted unit.
    // A future currency-conversion flow must update every monetary row atomically.
    currency: listing.pricingRule.currency,
    // Standard pricing belongs to the Pricing workspace once a listing exists.
    // Validate this detail edit against persisted values, not values posted by a
    // potentially stale editor, so concurrent calendar saves cannot be reverted.
    baseNightlyRate: listing.pricingRule.baseNightlyRate,
    cleaningFee: listing.pricingRule.cleaningFee,
    minNights: listing.pricingRule.minNights,
    checkInTime: formData.get("checkInTime") || undefined,
    checkOutTime: formData.get("checkOutTime") || undefined,
    // The classic detail form has no controls for these, so it posts nothing and the
    // listing keeps what the House rules section stored. Reading them here anyway would
    // make every save from that form clear four policies it never showed.
    petPolicy: listing.petPolicy ?? undefined,
    smokingPolicy: listing.smokingPolicy ?? undefined,
    eventPolicy: listing.eventPolicy ?? undefined,
    quietHoursPolicy: listing.quietHoursPolicy ?? undefined,
    quietHoursStart: listing.quietHoursStart ?? undefined,
    quietHoursEnd: listing.quietHoursEnd ?? undefined,
    additionalRules: listing.additionalRules ?? undefined,
    amenityIds: formData.getAll("amenityIds"),
  };

  const parsed = listingFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: firstZodMessage(parsed.error) };
  }

  const data = parsed.data;
  const mediaItems = parseMediaItemsFromForm(formData);
  const primaryImageIndex = firstImageIndex(mediaItems);

  await db.property.update({
    where: { id: listing.propertyId },
    data: {
      propertyType: data.propertyType,
      address: data.address,
      city: data.city,
      area: data.area,
      postalCode: data.postalCode,
      country: data.country,
      latitude: data.latitude,
      longitude: data.longitude,
      locationSource: data.locationSource,
      geocodingProvider: data.geocodingProvider,
      geocodingPlaceId: data.geocodingPlaceId,
      geocodingConfidence: data.geocodingConfidence,
      streetViewHeading: data.streetViewHeading,
      streetViewPitch: data.streetViewPitch,
      streetViewPanoId: data.streetViewPanoId,
    },
  });

  await db.listing.update({
    where: { id: listingId },
    data: {
      title: data.title,
      description: data.description,
      spaceType: data.spaceType,
      maxGuests: data.maxGuests,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      beds: data.beds,
      checkInTime: data.checkInTime || null,
      checkOutTime: data.checkOutTime || null,
      ...houseRulesCreateData(data, listing.quietHoursPeriods),
      // Editing a live listing stays live (listings publish immediately), but flags it
      // for admin re-review since the content just changed post-approval.
      ...(listing.status === "APPROVED" ? { needsReview: true } : {}),
    },
  });

  if (listing.status === "APPROVED") {
    // Public-facing content (title, price, photos, etc.) just changed on a live listing.
    revalidatePublicListingCaches();
  }

  await db.listingAmenity.deleteMany({ where: { listingId } });
  if (data.amenityIds && data.amenityIds.length > 0) {
    await db.listingAmenity.createMany({
      data: data.amenityIds.map((amenityId) => ({ listingId, amenityId })),
    });
  }

  const existingImages = await db.listingImage.findMany({
    where: { listingId },
    select: { url: true },
  });
  const keptUrls = new Set(mediaItems.map((item) => item.url));
  const removedUrls = existingImages
    .map((img) => img.url)
    .filter((url) => !keptUrls.has(url));

  // The gallery rewrite and the intent to unlink whatever dropped out of it commit
  // together. This used to unlink straight away, on a bare `/uploads/` prefix test and
  // with no reference check at all — which destroyed a file that a draft, or another
  // listing, was still showing. Both are the sweep's job now.
  const queued = await db.$transaction(async (tx) => {
    await tx.listingImage.deleteMany({ where: { listingId } });
    if (mediaItems.length > 0) {
      await tx.listingImage.createMany({
        data: mediaItems.map((item, i) => ({
          listingId,
          url: item.url,
          mediaType: item.mediaType as ListingMediaType,
          isPanorama: item.mediaType === "IMAGE" && item.isPanorama === true,
          displayOrder: i,
          isPrimary: i === primaryImageIndex,
        })),
      });
    }
    return enqueueUploadDeletions(tx, removedUrls, "listing-photo-replaced");
  });
  await sweepUploads(queued, `listing-photo-replaced:${listingId}`);

  revalidatePath(`/host/listings/${listingId}/edit`);
  revalidatePath("/host/listings");
  revalidatePath(`/host/listings/${listingId}`);
  revalidatePath(`/host/listings/${listingId}/photos`);
  revalidatePath("/host/listings");
  return { success: true };
}

/**
 * Publishes — or republishes — a listing. Named for a review queue this product does not
 * run: moderation is post-publication, so this writes APPROVED with `needsReview` and the
 * listing is live immediately. Only DRAFT and UNPUBLISHED are eligible; SUSPENDED and
 * ARCHIVED are admin-owned and APPROVED is already live.
 */
export async function submitForReview(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: await actionText("action.error.not_authorized", "Not authorized") };

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    include: {
      images: true,
      pricingRule: true,
      availabilityBlocks: {
        select: { startDate: true, endDate: true, reason: true },
      },
    },
  });

  if (!listing) return { error: await actionText("action.error.listing_not_found", "Listing not found") };

  if (listing.status !== "DRAFT" && listing.status !== "UNPUBLISHED") {
    return { error: await actionText("action.error.publish_state_invalid", "Only draft or unpublished listings can be published") };
  }

  if (!listing.pricingRule) return { error: await actionText("action.error.pricing_required", "Please set pricing before submitting") };

  if (listing.images.filter((item) => item.mediaType === "IMAGE").length < MIN_PUBLISH_PHOTOS) {
    return {
      error: await actionText(
        "action.error.photos_minimum",
        "Add at least {count} photos before publishing",
        { count: MIN_PUBLISH_PHOTOS },
      ),
    };
  }

  const availability = validateStoredListingAvailabilityForPublish(listing);
  if (!availability.ok) {
    return { error: await actionText(
      "action.error.availability_confirm_required",
      "Confirm availability before publishing. Choose unavailable by default, or set a future availability start date.",
    ) };
  }

  await db.listing.update({
    where: { id: listingId },
    data: {
      status: "APPROVED",
      needsReview: true,
      approvedAt: new Date(),
      publishedAt: new Date(),
    },
  });

  revalidatePath("/host/listings");
  revalidatePath("/host/listings");
  revalidatePublicListingCaches();
  return { success: true };
}

export async function unpublishListing(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: await actionText("action.error.not_authorized", "Not authorized") };

  const result = await unpublishOwnedListing(listingId, session.user.id);
  if (!result.success) return { error: result.error };

  revalidatePath("/host/listings");
  revalidatePath("/host/listings");
  revalidatePublicListingCaches();
  return { success: true };
}

/**
 * Archiving is the host's "put this away" action: the listing comes off the site and
 * moves out of the active list into the Archived filter, keeping its bookings history.
 * Blocked while money/dates are still in play (pending or confirmed bookings).
 */
export async function archiveListing(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: await actionText("action.error.not_authorized", "Not authorized") };

  const result = await archiveOwnedListing(listingId, session.user.id);
  if (!result.success) return { error: result.error };

  revalidatePath("/host/listings");
  revalidatePath("/host/listings");
  revalidatePublicListingCaches();
  return { success: true };
}

/** Brings an archived listing back as hidden — never straight back onto the site, so
 * the host reviews it and hits Unhide deliberately. */
export async function unarchiveListing(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: await actionText("action.error.not_authorized", "Not authorized") };

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id, status: "ARCHIVED" },
  });

  if (!listing) return { error: await actionText("action.error.listing_not_archived", "Listing not found or is not archived") };

  await db.listing.update({
    where: { id: listingId },
    data: { status: "UNPUBLISHED" },
  });

  revalidatePath("/host/listings");
  revalidatePath("/host/listings");
  revalidatePublicListingCaches();
  return { success: true };
}

export async function deleteListing(
  listingId: string
): Promise<{ success: true; outcome: "archived" | "deleted" } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: await actionText("action.error.not_authorized", "Not authorized") };
  }

  const result = await archiveOrDeleteListing(listingId, session.user.id);
  if ("error" in result) return result;

  revalidatePath("/host/listings");
  revalidatePath("/host/listings");
  revalidatePublicListingCaches();
  return { success: true, outcome: result.outcome };
}

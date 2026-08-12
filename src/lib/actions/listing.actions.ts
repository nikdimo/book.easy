"use server";

import type { ListingMediaType, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listingFormSchema } from "@/lib/validations/listing.schema";
import { generateUniqueSlug, archiveOrDeleteListing } from "@/lib/services/listing.service";
import { getStorageAdapter } from "@/lib/storage";
import { isLocalUploadUrl } from "@/lib/utils/upload-url";
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
  availabilityStartBlock,
  validateAvailabilityStartForPublish,
} from "@/lib/types/listing-availability-start";
import { getExchangeRates } from "@/lib/currency/rates";

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
    checkInTime: str("checkInTime"),
    checkOutTime: str("checkOutTime"),
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
): Promise<{ draftId: string } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" };
  }

  const jsonData = draftDataFromForm(formData);

  if (draftId) {
    const existing = await db.listingDraft.findFirst({
      where: { id: draftId, hostId: session.user.id },
      select: { id: true },
    });
    if (!existing) return { error: "Draft not found" };
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
  if (!session?.user?.id) return { error: "Not authorized" };

  const result = await db.listingDraft.deleteMany({
    where: { id: draftId, hostId: session.user.id },
  });
  if (result.count === 0) return { error: "Draft not found" };

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
  if (!session?.user?.id) return { error: "Not authorized" };

  const direct = parseCoordsFromMapsText(url);
  if (direct) return direct;

  if (!isShortMapsLink(url)) {
    return { error: "Couldn't find coordinates in that link" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url.trim(), { redirect: "follow", signal: controller.signal });
    clearTimeout(timeout);
    const resolved = parseCoordsFromMapsText(res.url);
    if (resolved) return resolved;
    return { error: "Couldn't find coordinates in that link" };
  } catch {
    return { error: "Couldn't resolve that link" };
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
      const parsed = JSON.parse(value) as { url?: unknown; mediaType?: unknown };
      const url = typeof parsed.url === "string" ? parsed.url.trim() : "";
      const mediaType = parsed.mediaType === "VIDEO" ? "VIDEO" : parsed.mediaType === "IMAGE" ? "IMAGE" : null;
      if (!mediaType || !isValidUploadUrl(url)) return [];
      return [{ url, mediaType }];
    } catch {
      return [];
    }
  });
}

function firstImageIndex(mediaItems: ListingMediaItem[]): number {
  return mediaItems.findIndex((item) => item.mediaType === "IMAGE");
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
    return { error: "Not authorized" };
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
  if (!(await currencyIsCurrentlyQuotable(data.currency))) {
    return { error: "That currency is not currently available. Choose another currency." };
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
    return { error: "Choose a discount between 5% and 50%." };
  }
  if (
    promotionType !== "NONE" &&
    (!Number.isInteger(promotionMinimumNights) ||
      promotionMinimumNights < 1 ||
      promotionMinimumNights > 365)
  ) {
    return { error: "Promotion minimum stay must be between 1 and 365 nights." };
  }
  if (promotionFreeCleaning && data.cleaningFee <= 0) {
    return { error: "Add a cleaning fee before offering free cleaning." };
  }
  const mediaItems = parseMediaItemsFromForm(formData);
  const primaryImageIndex = firstImageIndex(mediaItems);
  if (mediaItems.filter((item) => item.mediaType === "IMAGE").length < 3) {
    return { error: "Add at least 3 photos before publishing" };
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
      return {
        error:
          "That availability start date has already passed. Choose today or a later date.",
      };
    }
    if (availability.reason === "invalid-date") {
      return { error: "Choose a valid date for when guests can start booking." };
    }
    return { error: "Confirm when guests can start booking before publishing." };
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
      ? [{ ...startBlock, reason: "Before the listing's availability start date" }]
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
      // "" is the host choosing to stay flexible; null is how that reads everywhere it
      // is displayed, so the empty string never reaches the database.
      checkInTime: data.checkInTime || null,
      checkOutTime: data.checkOutTime || null,
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
          displayOrder: i,
          isPrimary: i === primaryImageIndex,
        })),
      },
    },
  });

  if (draftId) {
    await db.listingDraft.deleteMany({ where: { id: draftId, hostId: session.user.id } });
  }

  revalidatePath("/host/listings");
  revalidatePublicListingCaches();
  return { success: true, listingId: listing.id, slug: listing.slug };
}

export async function updateListing(listingId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" };
  }

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    include: { property: true, pricingRule: true },
  });
  if (!listing) return { error: "Listing not found" };
  if (!listing.pricingRule) {
    return { error: "Set pricing before publishing listing changes." };
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
    currency: formData.get("currency") || listing.pricingRule.currency,
    // Standard pricing belongs to the Pricing workspace once a listing exists.
    // Validate this detail edit against the persisted values, not values posted by a
    // potentially stale editor. The write below deliberately updates only currency,
    // so a calendar pricing save that lands during this request cannot be reverted.
    baseNightlyRate: listing.pricingRule.baseNightlyRate,
    cleaningFee: listing.pricingRule.cleaningFee,
    minNights: listing.pricingRule.minNights,
    checkInTime: formData.get("checkInTime") || undefined,
    checkOutTime: formData.get("checkOutTime") || undefined,
    amenityIds: formData.getAll("amenityIds"),
  };

  const parsed = listingFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: firstZodMessage(parsed.error) };
  }

  const data = parsed.data;
  if (!(await currencyIsCurrentlyQuotable(data.currency))) {
    return { error: "That currency is not currently available. Choose another currency." };
  }
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
      // Editing a live listing stays live (listings publish immediately), but flags it
      // for admin re-review since the content just changed post-approval.
      ...(listing.status === "APPROVED" ? { needsReview: true } : {}),
    },
  });

  if (listing.status === "APPROVED") {
    // Public-facing content (title, price, photos, etc.) just changed on a live listing.
    revalidatePublicListingCaches();
  }

  await db.pricingRule.update({
    where: { listingId },
    data: { currency: data.currency },
  });

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

  await db.listingImage.deleteMany({ where: { listingId } });
  if (mediaItems.length > 0) {
    await db.listingImage.createMany({
      data: mediaItems.map((item, i) => ({
        listingId,
        url: item.url,
        mediaType: item.mediaType as ListingMediaType,
        displayOrder: i,
        isPrimary: i === primaryImageIndex,
      })),
    });
  }

  const removedLocalUrls = removedUrls.filter(isLocalUploadUrl);
  if (removedLocalUrls.length > 0) {
    const storage = getStorageAdapter();
    await Promise.all(removedLocalUrls.map((url) => storage.delete(url)));
  }

  revalidatePath(`/host/listings/${listingId}/edit`);
  revalidatePath("/host/listings");
  return { success: true };
}

export async function submitForReview(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" };

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    include: { images: true, pricingRule: true },
  });

  if (!listing) return { error: "Listing not found" };

  if (
    listing.status !== "DRAFT" &&
    listing.status !== "REJECTED" &&
    listing.status !== "UNPUBLISHED"
  ) {
    return { error: "Only draft, rejected, or unpublished listings can be submitted for review" };
  }

  if (!listing.pricingRule) return { error: "Please set pricing before submitting" };

  if (listing.images.filter((item) => item.mediaType === "IMAGE").length < 3) {
    return { error: "Add at least 3 photos before publishing" };
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
  revalidatePublicListingCaches();
  return { success: true };
}

export async function unpublishListing(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" };

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id, status: "APPROVED" },
  });

  if (!listing) return { error: "Listing not found or cannot be unpublished" };

  await db.listing.update({
    where: { id: listingId },
    data: { status: "UNPUBLISHED" },
  });

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
  if (!session?.user?.id) return { error: "Not authorized" };

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    include: { bookings: { select: { status: true } } },
  });

  if (!listing) return { error: "Listing not found" };
  if (listing.status === "ARCHIVED") return { success: true };

  const hasActiveBooking = listing.bookings.some(
    (b) => b.status === "PENDING" || b.status === "CONFIRMED",
  );
  if (hasActiveBooking) {
    return {
      error:
        "Cannot archive a listing with active bookings. Cancel or complete pending bookings first.",
    };
  }

  await db.listing.update({
    where: { id: listingId },
    data: { status: "ARCHIVED" },
  });

  revalidatePath("/host/listings");
  revalidatePublicListingCaches();
  return { success: true };
}

/** Brings an archived listing back as hidden — never straight back onto the site, so
 * the host reviews it and hits Unhide deliberately. */
export async function unarchiveListing(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authorized" };

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id, status: "ARCHIVED" },
  });

  if (!listing) return { error: "Listing not found or is not archived" };

  await db.listing.update({
    where: { id: listingId },
    data: { status: "UNPUBLISHED" },
  });

  revalidatePath("/host/listings");
  revalidatePublicListingCaches();
  return { success: true };
}

export async function deleteListing(
  listingId: string
): Promise<{ success: true; outcome: "archived" | "deleted" } | { error: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" };
  }

  const result = await archiveOrDeleteListing(listingId, session.user.id);
  if ("error" in result) return result;

  revalidatePath("/host/listings");
  revalidatePublicListingCaches();
  return { success: true, outcome: result.outcome };
}

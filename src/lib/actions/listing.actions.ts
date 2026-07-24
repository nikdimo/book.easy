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
    title: str("title"),
    description: str("description"),
    propertyType: str("propertyType"),
    address: str("address"),
    city: str("city"),
    area: str("area"),
    latitude: str("latitude"),
    longitude: str("longitude"),
    maxGuests: str("maxGuests"),
    bedrooms: str("bedrooms"),
    bathrooms: str("bathrooms"),
    beds: str("beds"),
    baseNightlyRate: str("baseNightlyRate"),
    cleaningFee: str("cleaningFee"),
    minNights: str("minNights"),
    mediaItems: parseMediaItemsFromForm(formData) as unknown as Prisma.InputJsonValue,
    amenityIds: formData.getAll("amenityIds").filter((v): v is string => typeof v === "string"),
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
): Promise<{ error: string } | { success: true; listingId: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" };
  }

  const raw = {
    title: formData.get("title"),
    description: formData.get("description"),
    propertyType: formData.get("propertyType"),
    address: formData.get("address"),
    city: formData.get("city"),
    area: formData.get("area") || undefined,
    country: formData.get("country") || "North Macedonia",
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
    maxGuests: formData.get("maxGuests"),
    bedrooms: formData.get("bedrooms"),
    bathrooms: formData.get("bathrooms"),
    beds: formData.get("beds"),
    baseNightlyRate: formData.get("baseNightlyRate"),
    cleaningFee: formData.get("cleaningFee") || "0",
    minNights: formData.get("minNights") || "1",
    amenityIds: formData.getAll("amenityIds"),
  };

  const parsed = listingFormSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: firstZodMessage(parsed.error) };
  }

  const data = parsed.data;
  const mediaItems = parseMediaItemsFromForm(formData);
  const primaryImageIndex = firstImageIndex(mediaItems);
  if (mediaItems.filter((item) => item.mediaType === "IMAGE").length < 3) {
    return { error: "Add at least 3 photos before publishing" };
  }

  const slug = await generateUniqueSlug(data.title);

  const property = await db.property.create({
    data: {
      ownerId: session.user.id,
      name: data.title,
      propertyType: data.propertyType,
      address: data.address,
      city: data.city,
      area: data.area,
      country: data.country,
      latitude: data.latitude,
      longitude: data.longitude,
    },
  });

  const listing = await db.listing.create({
    data: {
      propertyId: property.id,
      hostId: session.user.id,
      title: data.title,
      slug,
      description: data.description,
      status: "APPROVED",
      needsReview: true,
      approvedAt: new Date(),
      publishedAt: new Date(),
      maxGuests: data.maxGuests,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      beds: data.beds,
      pricingRule: {
        create: {
          baseNightlyRate: data.baseNightlyRate,
          cleaningFee: data.cleaningFee,
          minNights: data.minNights,
        },
      },
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
  return { success: true, listingId: listing.id };
}

export async function updateListing(listingId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" };
  }

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    include: { property: true },
  });
  if (!listing) return { error: "Listing not found" };

  const raw = {
    title: formData.get("title"),
    description: formData.get("description"),
    propertyType: formData.get("propertyType"),
    address: formData.get("address"),
    city: formData.get("city"),
    area: formData.get("area") || undefined,
    country: formData.get("country") || "North Macedonia",
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
    maxGuests: formData.get("maxGuests"),
    bedrooms: formData.get("bedrooms"),
    bathrooms: formData.get("bathrooms"),
    beds: formData.get("beds"),
    baseNightlyRate: formData.get("baseNightlyRate"),
    cleaningFee: formData.get("cleaningFee") || "0",
    minNights: formData.get("minNights") || "1",
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
      country: data.country,
      latitude: data.latitude,
      longitude: data.longitude,
    },
  });

  await db.listing.update({
    where: { id: listingId },
    data: {
      title: data.title,
      description: data.description,
      maxGuests: data.maxGuests,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      beds: data.beds,
      // Editing a live listing stays live (listings publish immediately), but flags it
      // for admin re-review since the content just changed post-approval.
      ...(listing.status === "APPROVED" ? { needsReview: true } : {}),
    },
  });

  if (listing.status === "APPROVED") {
    // Public-facing content (title, price, photos, etc.) just changed on a live listing.
    revalidatePublicListingCaches();
  }

  await db.pricingRule.upsert({
    where: { listingId },
    update: {
      baseNightlyRate: data.baseNightlyRate,
      cleaningFee: data.cleaningFee,
      minNights: data.minNights,
    },
    create: {
      listingId,
      baseNightlyRate: data.baseNightlyRate,
      cleaningFee: data.cleaningFee,
      minNights: data.minNights,
    },
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

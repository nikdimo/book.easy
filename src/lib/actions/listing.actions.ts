"use server";

import type { Prisma } from "@prisma/client";
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
    imageUrls: formData.getAll("imageUrls").filter((v): v is string => typeof v === "string"),
    amenityIds: formData.getAll("amenityIds").filter((v): v is string => typeof v === "string"),
  };
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

function parseImageUrlsFromForm(formData: FormData): string[] {
  const raw = formData.getAll("imageUrls").filter((v): v is string => typeof v === "string");
  return raw.filter((url) => {
    const t = url.trim();
    return (
      t.length > 0 &&
      (t.startsWith("/") || t.startsWith("https://") || t.startsWith("http://"))
    );
  });
}

/**
 * Creates a new listing and sends it straight to review in one step — there's no
 * intermediate "created but not submitted" state a real Listing row can be in; that's
 * what ListingDraft (see saveListingDraft above) is for, before this is called. Deletes
 * the originating draft row on success, since its job is done. Returns rather than
 * redirecting so the caller can show a confirmation dialog first.
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
  const imageUrls = parseImageUrlsFromForm(formData);
  if (imageUrls.length === 0) {
    return { error: "Add at least one photo before submitting for review" };
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
      status: "PENDING_REVIEW",
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
        create: imageUrls.map((url, i) => ({
          url,
          displayOrder: i,
          isPrimary: i === 0,
        })),
      },
    },
  });

  if (draftId) {
    await db.listingDraft.deleteMany({ where: { id: draftId, hostId: session.user.id } });
  }

  revalidatePath("/host/listings");
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
  const imageUrls = parseImageUrlsFromForm(formData);

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
      // Editing a live listing must send it back through moderation (US-03.02) —
      // otherwise an approved listing could be swapped for arbitrary content post-review.
      ...(listing.status === "APPROVED" ? { status: "PENDING_REVIEW" as const } : {}),
    },
  });

  if (listing.status === "APPROVED") {
    // Just lost public visibility as a side effect of the edit above.
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
  const keptUrls = new Set(imageUrls);
  const removedUrls = existingImages
    .map((img) => img.url)
    .filter((url) => !keptUrls.has(url));

  await db.listingImage.deleteMany({ where: { listingId } });
  if (imageUrls.length > 0) {
    await db.listingImage.createMany({
      data: imageUrls.map((url, i) => ({
        listingId,
        url,
        displayOrder: i,
        isPrimary: i === 0,
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

  if (listing.images.length === 0) {
    return { error: "Add at least one photo before submitting for review" };
  }

  await db.listing.update({
    where: { id: listingId },
    data: { status: "PENDING_REVIEW" },
  });

  revalidatePath("/host/listings");
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

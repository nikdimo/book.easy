"use server";

import type { PropertyType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { listingFormSchema } from "@/lib/validations/listing.schema";
import { generateUniqueSlug } from "@/lib/services/listing.service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { firstZodMessage } from "@/lib/utils/zod-error";

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

export async function createListing(formData: FormData) {
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
  const slug = await generateUniqueSlug(data.title);

  const property = await db.property.create({
    data: {
      ownerId: session.user.id,
      name: data.title,
      propertyType: data.propertyType as PropertyType,
      address: data.address,
      city: data.city,
      area: data.area,
      country: data.country,
    },
  });

  const listing = await db.listing.create({
    data: {
      propertyId: property.id,
      hostId: session.user.id,
      title: data.title,
      slug,
      description: data.description,
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
    },
  });

  if (imageUrls.length > 0) {
    await db.listingImage.createMany({
      data: imageUrls.map((url, i) => ({
        listingId: listing.id,
        url,
        displayOrder: i,
        isPrimary: i === 0,
      })),
    });
  }

  revalidatePath("/host/listings");
  redirect(`/host/listings/${listing.id}/edit`);
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
      propertyType: data.propertyType as PropertyType,
      address: data.address,
      city: data.city,
      area: data.area,
      country: data.country,
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
    },
  });

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

  if (listing.status !== "DRAFT" && listing.status !== "REJECTED") {
    return { error: "Only draft or rejected listings can be submitted for review" };
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
  return { success: true };
}

export async function deleteListing(listingId: string) {
  const session = await auth();
  if (!session?.user?.id || !session.user.isHost) {
    return { error: "Not authorized" };
  }

  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId: session.user.id },
    include: {
      bookings: {
        where: { status: { in: ["PENDING", "CONFIRMED"] } },
        select: { id: true },
      },
    },
  });

  if (!listing) return { error: "Listing not found" };

  if (listing.bookings.length > 0) {
    return {
      error:
        "Cannot delete a listing with active bookings. Cancel or complete pending bookings first.",
    };
  }

  const propertyId = listing.propertyId;

  await db.booking.deleteMany({ where: { listingId } });
  await db.listing.delete({ where: { id: listingId } });

  const siblingCount = await db.listing.count({ where: { propertyId } });
  if (siblingCount === 0) {
    await db.property.delete({ where: { id: propertyId } });
  }

  revalidatePath("/host/listings");
  revalidatePath("/");
  return { success: true };
}

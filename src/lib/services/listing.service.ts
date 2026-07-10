import "server-only";
import { db } from "@/lib/db";
import { ListingStatus } from "@prisma/client";
import slugify from "slugify";
import { completePastBookings } from "@/lib/services/booking.service";
import { getStorageAdapter } from "@/lib/storage";
import { isLocalUploadUrl } from "@/lib/utils/upload-url";

export async function getHostListings(hostId: string) {
  return db.listing.findMany({
    where: { hostId },
    include: {
      property: true,
      images: { where: { isPrimary: true }, take: 1 },
      pricingRule: true,
      _count: { select: { bookings: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getHostListing(listingId: string, hostId: string) {
  return db.listing.findFirst({
    where: { id: listingId, hostId },
    include: {
      property: true,
      images: { orderBy: { displayOrder: "asc" } },
      pricingRule: true,
      amenities: { include: { amenity: true } },
    },
  });
}

export async function getHostBookings(hostId: string) {
  await completePastBookings();
  return db.booking.findMany({
    where: { listing: { hostId } },
    include: {
      listing: { include: { property: true } },
      guest: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title, { lower: true, strict: true });
  let slug = base;
  let counter = 1;

  while (await db.listing.findUnique({ where: { slug } })) {
    slug = `${base}-${counter}`;
    counter++;
  }

  return slug;
}

export type ArchiveOrDeleteListingResult =
  | { outcome: "archived" }
  | { outcome: "deleted" }
  | { error: string };

/**
 * Deletes a listing that has never had a booking, or archives it (status = ARCHIVED)
 * if it has any booking history — bookings are financial/operational records that must
 * never be deleted (see docs/architecture/system-architecture.md §11 Data Lifecycle &
 * Soft Delete Policy). Refuses if the listing has an active (PENDING/CONFIRMED)
 * booking; the host must resolve those first.
 */
export async function archiveOrDeleteListing(
  listingId: string,
  hostId: string
): Promise<ArchiveOrDeleteListingResult> {
  const listing = await db.listing.findFirst({
    where: { id: listingId, hostId },
    include: {
      bookings: { select: { id: true, status: true } },
      images: { select: { url: true } },
    },
  });

  if (!listing) return { error: "Listing not found" };

  const hasActiveBooking = listing.bookings.some(
    (b) => b.status === "PENDING" || b.status === "CONFIRMED"
  );
  if (hasActiveBooking) {
    return {
      error:
        "Cannot delete a listing with active bookings. Cancel or complete pending bookings first.",
    };
  }

  if (listing.bookings.length > 0) {
    await db.listing.update({
      where: { id: listingId },
      data: { status: ListingStatus.ARCHIVED },
    });
    return { outcome: "archived" };
  }

  const propertyId = listing.propertyId;
  const localImageUrls = listing.images.map((img) => img.url).filter(isLocalUploadUrl);
  if (localImageUrls.length > 0) {
    const storage = getStorageAdapter();
    await Promise.all(localImageUrls.map((url) => storage.delete(url)));
  }

  await db.listing.delete({ where: { id: listingId } });

  const siblingCount = await db.listing.count({ where: { propertyId } });
  if (siblingCount === 0) {
    await db.property.delete({ where: { id: propertyId } });
  }

  return { outcome: "deleted" };
}

export async function getHostDashboardStats(hostId: string) {
  await completePastBookings();
  const [listings, pendingBookings, confirmedBookings, totalBookings] = await Promise.all([
    db.listing.count({ where: { hostId } }),
    db.booking.count({ where: { listing: { hostId }, status: "PENDING" } }),
    db.booking.count({ where: { listing: { hostId }, status: "CONFIRMED" } }),
    db.booking.count({ where: { listing: { hostId } } }),
  ]);

  return { listings, pendingBookings, confirmedBookings, totalBookings };
}

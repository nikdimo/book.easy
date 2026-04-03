import { db } from "@/lib/db";
import { ListingStatus } from "@prisma/client";
import slugify from "slugify";

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

export async function getHostDashboardStats(hostId: string) {
  const [listings, pendingBookings, confirmedBookings, totalBookings] = await Promise.all([
    db.listing.count({ where: { hostId } }),
    db.booking.count({ where: { listing: { hostId }, status: "PENDING" } }),
    db.booking.count({ where: { listing: { hostId }, status: "CONFIRMED" } }),
    db.booking.count({ where: { listing: { hostId } } }),
  ]);

  return { listings, pendingBookings, confirmedBookings, totalBookings };
}

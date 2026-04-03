import { db } from "@/lib/db";
import { ListingStatus, Prisma } from "@prisma/client";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { serializeListingCard } from "@/lib/serializers/listing-card";

export interface SearchFilters {
  city?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  minPrice?: number;
  maxPrice?: number;
  amenities?: string[];
  propertyType?: string;
  page?: number;
  sort?: "price_asc" | "price_desc" | "newest";
}

export async function searchListings(filters: SearchFilters) {
  const page = filters.page || 1;
  const skip = (page - 1) * ITEMS_PER_PAGE;

  const where: Prisma.ListingWhereInput = {
    status: ListingStatus.APPROVED,
  };

  if (filters.city) {
    where.property = {
      OR: [
        { city: { contains: filters.city, mode: "insensitive" } },
        { area: { contains: filters.city, mode: "insensitive" } },
        { country: { contains: filters.city, mode: "insensitive" } },
      ],
    };
  }

  if (filters.guests) {
    where.maxGuests = { gte: filters.guests };
  }

  if (filters.propertyType) {
    where.property = {
      ...where.property as Prisma.PropertyWhereInput,
      propertyType: filters.propertyType as Prisma.EnumPropertyTypeFilter["equals"],
    };
  }

  if (filters.minPrice || filters.maxPrice) {
    where.pricingRule = {
      ...(filters.minPrice && { baseNightlyRate: { gte: filters.minPrice } }),
      ...(filters.maxPrice && { baseNightlyRate: { lte: filters.maxPrice } }),
    };
  }

  if (filters.amenities && filters.amenities.length > 0) {
    where.amenities = {
      some: {
        amenity: { name: { in: filters.amenities } },
      },
    };
  }

  if (filters.checkIn && filters.checkOut) {
    where.availabilityBlocks = {
      none: {
        startDate: { lt: new Date(filters.checkOut) },
        endDate: { gt: new Date(filters.checkIn) },
      },
    };
  }

  let orderBy: Prisma.ListingOrderByWithRelationInput = { createdAt: "desc" };
  if (filters.sort === "price_asc") {
    orderBy = { pricingRule: { baseNightlyRate: "asc" } };
  } else if (filters.sort === "price_desc") {
    orderBy = { pricingRule: { baseNightlyRate: "desc" } };
  }

  const [listings, total] = await Promise.all([
    db.listing.findMany({
      where,
      include: {
        property: true,
        images: { where: { isPrimary: true }, take: 1 },
        pricingRule: true,
        amenities: { include: { amenity: true } },
      },
      orderBy,
      skip,
      take: ITEMS_PER_PAGE,
    }),
    db.listing.count({ where }),
  ]);

  return {
    listings: listings.map(serializeListingCard),
    total,
    page,
    totalPages: Math.ceil(total / ITEMS_PER_PAGE),
  };
}

export async function getFeaturedListings(limit = 6) {
  const rows = await db.listing.findMany({
    where: { status: ListingStatus.APPROVED },
    include: {
      property: true,
      images: { where: { isPrimary: true }, take: 1 },
      pricingRule: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(serializeListingCard);
}

export async function getAvailableAmenities() {
  return db.amenity.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function getAvailableCities() {
  const properties = await db.property.findMany({
    where: { listings: { some: { status: ListingStatus.APPROVED } } },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });
  return properties.map((p) => p.city);
}

import { db } from "@/lib/db";
import { ListingStatus, Prisma, PropertyType } from "@prisma/client";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { sortPropertyTypesInDisplayOrder } from "@/lib/property-type-filter";
import { serializeListingCard } from "@/lib/serializers/listing-card";

export interface SearchFilters {
  city?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  amenities?: string[];
  /** Subset of Prisma `PropertyType`; omit or empty means no type restriction. */
  propertyTypes?: string[];
  page?: number;
  sort?: "price_asc" | "price_desc" | "newest";
}

export interface SearchFilterPreview {
  totalCount: number;
  availablePropertyTypes: string[];
  availableAmenities: string[];
  maxBedrooms: number;
}

function buildListingWhere(filters: SearchFilters): Prisma.ListingWhereInput {
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

  if (filters.bedrooms) {
    where.bedrooms = { gte: filters.bedrooms };
  }

  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    where.property = {
      ...(where.property as Prisma.PropertyWhereInput),
      propertyType: { in: filters.propertyTypes as PropertyType[] },
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

  return where;
}

function collectAvailablePropertyTypes(
  values: readonly (string | PropertyType)[]
): string[] {
  return sortPropertyTypesInDisplayOrder([...new Set(values.map(String))]);
}

export async function searchListings(filters: SearchFilters) {
  const page = filters.page || 1;
  const skip = (page - 1) * ITEMS_PER_PAGE;
  const where = buildListingWhere(filters);

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
        images: { orderBy: { displayOrder: "asc" }, take: 8 },
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
      images: { orderBy: { displayOrder: "asc" }, take: 8 },
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

export async function getAvailableAmenityNames(filters: SearchFilters) {
  const where = buildListingWhere({
    ...filters,
    page: undefined,
    amenities: undefined,
  });

  const listings = await db.listing.findMany({
    where,
    select: {
      amenities: {
        select: {
          amenity: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  return [...new Set(
    listings.flatMap((listing) =>
      listing.amenities.map(({ amenity }) => amenity.name)
    )
  )].sort((a, b) => a.localeCompare(b));
}

export async function getAvailablePropertyTypes(filters: SearchFilters) {
  const where = buildListingWhere({
    ...filters,
    page: undefined,
    propertyTypes: undefined,
  });

  const listings = await db.listing.findMany({
    where,
    select: {
      property: {
        select: {
          propertyType: true,
        },
      },
    },
  });

  return collectAvailablePropertyTypes(
    listings.map((listing) => listing.property.propertyType)
  );
}

export async function getSearchFilterPreview(
  filters: SearchFilters
): Promise<SearchFilterPreview> {
  const totalWhere = buildListingWhere({
    ...filters,
    page: undefined,
  });
  const propertyTypesWhere = buildListingWhere({
    ...filters,
    page: undefined,
    propertyTypes: undefined,
  });
  const amenitiesWhere = buildListingWhere({
    ...filters,
    page: undefined,
    amenities: undefined,
  });
  const bedroomsWhere = buildListingWhere({
    ...filters,
    page: undefined,
    bedrooms: undefined,
  });

  const [totalCount, propertyTypeRows, amenityRows, bedroomStats] =
    await Promise.all([
      db.listing.count({ where: totalWhere }),
      db.listing.findMany({
        where: propertyTypesWhere,
        select: {
          property: {
            select: {
              propertyType: true,
            },
          },
        },
      }),
      db.listing.findMany({
        where: amenitiesWhere,
        select: {
          amenities: {
            select: {
              amenity: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      }),
      db.listing.aggregate({
        where: bedroomsWhere,
        _max: {
          bedrooms: true,
        },
      }),
    ]);

  return {
    totalCount,
    availablePropertyTypes: collectAvailablePropertyTypes(
      propertyTypeRows.map((listing) => listing.property.propertyType)
    ),
    availableAmenities: [...new Set(
      amenityRows.flatMap((listing) =>
        listing.amenities.map(({ amenity }) => amenity.name)
      )
    )].sort((a, b) => a.localeCompare(b)),
    maxBedrooms: bedroomStats._max.bedrooms ?? 0,
  };
}

export async function getAvailableCities() {
  const properties = await db.property.findMany({
    where: { listings: { some: { status: ListingStatus.APPROVED } } },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });
  const seen = new Set<string>();

  return properties
    .map((p) => p.city.trim())
    .filter((city) => city.length > 0)
    .filter((city) => {
      const key = city.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function getAvailablePropertyTypesByCity() {
  const properties = await db.property.findMany({
    where: { listings: { some: { status: ListingStatus.APPROVED } } },
    select: { city: true, propertyType: true },
    orderBy: [{ city: "asc" }, { propertyType: "asc" }],
  });

  const canonicalCityByKey = new Map<string, string>();
  const propertyTypesByCity = new Map<string, string[]>();

  for (const property of properties) {
    const city = property.city.trim();
    if (!city) continue;

    const cityKey = city.toLowerCase();
    const canonicalCity = canonicalCityByKey.get(cityKey) ?? city;
    canonicalCityByKey.set(cityKey, canonicalCity);

    const current = propertyTypesByCity.get(canonicalCity) ?? [];
    current.push(property.propertyType);
    propertyTypesByCity.set(canonicalCity, current);
  }

  return Object.fromEntries(
    [...propertyTypesByCity.entries()].map(([city, propertyTypes]) => [
      city,
      collectAvailablePropertyTypes(propertyTypes),
    ])
  );
}

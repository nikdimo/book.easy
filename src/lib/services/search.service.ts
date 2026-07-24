import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { ListingStatus, Prisma } from "@prisma/client";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { sortPropertyTypesInDisplayOrder } from "@/lib/property-type-filter";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import {
  serializeListingCard,
  listingCardSelect,
  getFirstVideoUrlsByListingIds,
} from "@/lib/serializers/listing-card";
import { placeKey, type PlaceOption } from "@/lib/utils/place";
import type {
  SearchFilterPreview,
  SearchFilters,
} from "@/lib/types/search";

/** Invalidated on-demand (via revalidateTag) whenever a listing's public visibility
 * changes — see submitNewListing/updateListing in lib/actions/listing.actions.ts and
 * suspendListing in lib/actions/admin.actions.ts — with a time-based fallback so it's
 * never wrong for more than a few minutes either way. */
export const PUBLIC_HEADER_DATA_TAG = "public-header-data";

/** Grid/search cards show at most a handful of photos (hover carousel) — fetching all
 * of a listing's images per card (previously up to 8) is wasted payload for a list
 * view; the full gallery loads on the listing detail page instead. */
const CARD_IMAGE_LIMIT = 4;

function buildListingWhere(filters: SearchFilters): Prisma.ListingWhereInput {
  const where: Prisma.ListingWhereInput = {
    status: ListingStatus.APPROVED,
  };

  if (filters.city && filters.country) {
    // Exact (city, country) pair — known from the autocomplete — so two same-named
    // cities in different countries don't get merged into one result set.
    where.property = {
      city: { equals: filters.city, mode: "insensitive" },
      country: { equals: filters.country, mode: "insensitive" },
    };
  } else if (filters.city) {
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
      propertyType: { in: filters.propertyTypes },
    };
  }

  if (filters.minPrice || filters.maxPrice) {
    where.pricingRule = {
      ...(filters.minPrice && { baseNightlyRate: { gte: filters.minPrice } }),
      ...(filters.maxPrice && { baseNightlyRate: { lte: filters.maxPrice } }),
    };
  }

  if (filters.amenities && filters.amenities.length > 0) {
    // Must have ALL selected amenities (US-05.05 / phase-1-scope.md technical
    // acceptance criteria), not just any one of them — one `some` clause per amenity,
    // ANDed together.
    where.AND = filters.amenities.map((name) => ({
      amenities: { some: { amenity: { name } } },
    }));
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

async function collectAvailablePropertyTypes(
  values: readonly string[]
): Promise<string[]> {
  const allTypes = await getActivePropertyTypes();
  const allValues = allTypes.map((t) => t.value);
  return sortPropertyTypesInDisplayOrder([...new Set(values)], allValues);
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
      select: {
        ...listingCardSelect,
        images: {
          where: { mediaType: "IMAGE" },
          select: { url: true, alt: true },
          orderBy: { displayOrder: "asc" },
          take: CARD_IMAGE_LIMIT,
        },
      },
      orderBy,
      skip,
      take: ITEMS_PER_PAGE,
    }),
    db.listing.count({ where }),
  ]);

  const videoUrls = await getFirstVideoUrlsByListingIds(listings.map((l) => l.id));

  return {
    listings: listings.map((l) => serializeListingCard(l, videoUrls.get(l.id))),
    total,
    page,
    totalPages: Math.ceil(total / ITEMS_PER_PAGE),
  };
}

const cardSelectWithImages = {
  ...listingCardSelect,
  images: {
    where: { mediaType: "IMAGE" as const },
    select: { url: true, alt: true },
    orderBy: { displayOrder: "asc" as const },
    take: CARD_IMAGE_LIMIT,
  },
};

/** Newest public listings. This is the honest default ordering for the home page —
 *  see getPopularListings for the demand-ranked one. */
export async function getFeaturedListings(limit = 6, excludeIds: string[] = []) {
  const rows = await db.listing.findMany({
    where: {
      status: ListingStatus.APPROVED,
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    },
    select: cardSelectWithImages,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const videoUrls = await getFirstVideoUrlsByListingIds(rows.map((r) => r.id));
  return rows.map((r) => serializeListingCard(r, videoUrls.get(r.id)));
}

/**
 * Listings ranked by the demand signal computed in lib/services/popularity.service.ts.
 * Listings with a score of 0 have no signal yet and are excluded rather than filled in
 * with an arbitrary ordering — if this returns fewer rows than asked for, the caller
 * genuinely doesn't have enough data to label anything "popular".
 */
export async function getPopularListings(limit = 8) {
  const rows = await db.listing.findMany({
    where: { status: ListingStatus.APPROVED, popularityScore: { gt: 0 } },
    select: cardSelectWithImages,
    orderBy: [{ popularityScore: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  const videoUrls = await getFirstVideoUrlsByListingIds(rows.map((r) => r.id));
  return rows.map((r) => serializeListingCard(r, videoUrls.get(r.id)));
}

/** Total publicly visible listings — drives how much of the home page is worth
 *  splitting into sections at all. */
export async function countApprovedListings() {
  return db.listing.count({ where: { status: ListingStatus.APPROVED } });
}

export async function getAvailableAmenities() {
  return db.amenity.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function getAvailableAmenityNames(filters: SearchFilters) {
  const where = buildListingWhere({
    ...filters,
    page: undefined,
    amenities: undefined,
  });

  // Ask the DB for distinct amenity names directly instead of fetching every matching
  // listing's full amenity list and deduping in Node.
  const rows = await db.amenity.findMany({
    where: { listings: { some: { listing: where } } },
    select: { name: true },
    orderBy: { name: "asc" },
  });

  return rows.map((r) => r.name);
}

export async function getAvailablePropertyTypes(filters: SearchFilters) {
  const where = buildListingWhere({
    ...filters,
    page: undefined,
    propertyTypes: undefined,
  });

  const rows = await db.property.groupBy({
    by: ["propertyType"],
    where: { listings: { some: where } },
  });

  return collectAvailablePropertyTypes(rows.map((r) => r.propertyType));
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
      db.property.groupBy({
        by: ["propertyType"],
        where: { listings: { some: propertyTypesWhere } },
      }),
      db.amenity.findMany({
        where: { listings: { some: { listing: amenitiesWhere } } },
        select: { name: true },
        orderBy: { name: "asc" },
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
    availablePropertyTypes: await collectAvailablePropertyTypes(
      propertyTypeRows.map((r) => r.propertyType)
    ),
    availableAmenities: amenityRows.map((r) => r.name),
    maxBedrooms: bedroomStats._max.bedrooms ?? 0,
  };
}

// Read on every public page (the header's location/type autocomplete), so this is
// cached rather than hitting the DB per navigation — bounded by a 5 minute fallback and
// invalidated on-demand when a listing's approval/suspension status changes.
export const getAvailableCities = unstable_cache(
  async (): Promise<PlaceOption[]> => {
    const properties = await db.property.findMany({
      where: { listings: { some: { status: ListingStatus.APPROVED } } },
      select: { city: true, country: true },
      distinct: ["city", "country"],
      orderBy: [{ city: "asc" }, { country: "asc" }],
    });
    const seen = new Set<string>();
    const result: PlaceOption[] = [];

    for (const p of properties) {
      const city = p.city.trim();
      const country = p.country.trim();
      if (!city) continue;

      const key = placeKey({ city, country });
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ city, country });
    }

    return result;
  },
  ["available-cities"],
  { revalidate: 300, tags: [PUBLIC_HEADER_DATA_TAG] }
);

export const getAvailablePropertyTypesByCity = unstable_cache(
  async (): Promise<Record<string, string[]>> => {
    // Distinct (city, country, propertyType) rows computed by the DB instead of
    // fetching every approved property and deduping in Node. Keyed by `placeKey` (not
    // bare city) so two same-named cities in different countries don't merge lists.
    const rows = await db.property.groupBy({
      by: ["city", "country", "propertyType"],
      where: { listings: { some: { status: ListingStatus.APPROVED } } },
    });

    const canonicalKeyByLookup = new Map<string, string>();
    const propertyTypesByKey = new Map<string, string[]>();

    for (const row of rows) {
      const city = row.city.trim();
      const country = row.country.trim();
      if (!city) continue;

      const place = { city, country };
      const lookup = placeKey(place);
      const canonicalKey = canonicalKeyByLookup.get(lookup) ?? lookup;
      canonicalKeyByLookup.set(lookup, canonicalKey);

      const current = propertyTypesByKey.get(canonicalKey) ?? [];
      current.push(row.propertyType);
      propertyTypesByKey.set(canonicalKey, current);
    }

    const entries = await Promise.all(
      [...propertyTypesByKey.entries()].map(
        async ([key, propertyTypes]) =>
          [key, await collectAvailablePropertyTypes(propertyTypes)] as const
      )
    );
    return Object.fromEntries(entries);
  },
  ["available-property-types-by-city"],
  { revalidate: 300, tags: [PUBLIC_HEADER_DATA_TAG] }
);

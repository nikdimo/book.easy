import { Suspense } from "react";
import Link from "next/link";
import { PropertyCard } from "@/components/public/property-card";
import { PropertiesExplorerClient } from "@/components/marketplace/properties-explorer-client";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import {
  searchListings,
  getAvailableAmenities,
  getSearchFilterPreview,
} from "@/lib/services/search.service";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import {
  parsePropertyTypesSelectionFromParams,
  propertyTypesForSearchQuery,
  stringifyPropertyTypesParam,
} from "@/lib/property-type-filter";
import { getMapCoordinatesForListing } from "@/lib/utils/listing-map-coords";
import { formatPrice, getNightCount } from "@/lib/utils/format";
import type { MapPin } from "@/components/marketplace/properties-map";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata = {
  title: "Explore Properties",
  description: "Browse and search properties across North Macedonia",
};

export default async function PropertiesPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;

  const propertyTypes = await getActivePropertyTypes();
  const allPropertyTypeValues = propertyTypes.map((t) => t.value);

  const selectedPropertyTypes = parsePropertyTypesSelectionFromParams(params, allPropertyTypeValues);
  const propertyTypesFilter = propertyTypesForSearchQuery(selectedPropertyTypes, allPropertyTypeValues);
  const propertyTypesQuery = stringifyPropertyTypesParam(selectedPropertyTypes, allPropertyTypeValues);

  const filters = {
    city: typeof params.city === "string" ? params.city : undefined,
    checkIn: typeof params.checkIn === "string" ? params.checkIn : undefined,
    checkOut: typeof params.checkOut === "string" ? params.checkOut : undefined,
    guests: params.guests ? Number(params.guests) : undefined,
    minPrice: params.minPrice ? Number(params.minPrice) : undefined,
    maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
    bedrooms: params.bedrooms ? Number(params.bedrooms) : undefined,
    propertyTypes: propertyTypesFilter,
    amenities: params.amenities
      ? Array.isArray(params.amenities)
        ? params.amenities
        : [params.amenities]
      : undefined,
    sort: typeof params.sort === "string" ? (params.sort as "price_asc" | "price_desc" | "newest") : undefined,
    page: params.page ? Number(params.page) : 1,
  };

  // Adults/children/infants/pets breakdown, carried through as opaque passthrough
  // params (not used for filtering — search.service only needs the `guests` total)
  // so the header's guest selector doesn't collapse back to an all-adults count when
  // the user paginates or clicks into a listing and back.
  const guestBreakdownParams: Record<string, string> = {};
  for (const key of ["adults", "children", "infants", "pets"] as const) {
    const value = params[key];
    if (typeof value === "string" && value) guestBreakdownParams[key] = value;
  }

  const [
    results,
    amenities,
    filterPreview,
  ] = await Promise.all([
    searchListings(filters),
    getAvailableAmenities(),
    getSearchFilterPreview(filters),
  ]);

  function buildPageUrl(page: number) {
    const p = new URLSearchParams();
    if (filters.city) p.set("city", filters.city);
    if (filters.checkIn) p.set("checkIn", filters.checkIn);
    if (filters.checkOut) p.set("checkOut", filters.checkOut);
    if (filters.guests) p.set("guests", String(filters.guests));
    Object.entries(guestBreakdownParams).forEach(([key, value]) => p.set(key, value));
    if (filters.minPrice) p.set("minPrice", String(filters.minPrice));
    if (filters.maxPrice) p.set("maxPrice", String(filters.maxPrice));
    if (filters.bedrooms) p.set("bedrooms", String(filters.bedrooms));
    if (propertyTypesQuery) p.set("propertyTypes", propertyTypesQuery);
    if (filters.amenities) filters.amenities.forEach((a) => p.append("amenities", a));
    if (filters.sort) p.set("sort", filters.sort);
    p.set("page", String(page));
    return `/properties?${p.toString()}`;
  }

  const totalLabel = `${results.total} ${results.total === 1 ? "home" : "homes"}${
    filters.checkIn && filters.checkOut ? " · dates applied in filters" : ""
  }`;

  const nightCount =
    filters.checkIn && filters.checkOut
      ? Math.max(1, getNightCount(filters.checkIn, filters.checkOut))
      : undefined;

  const listingQuery = new URLSearchParams();
  if (filters.checkIn) listingQuery.set("checkIn", filters.checkIn);
  if (filters.checkOut) listingQuery.set("checkOut", filters.checkOut);
  if (filters.guests) listingQuery.set("guests", String(filters.guests));
  Object.entries(guestBreakdownParams).forEach(([key, value]) =>
    listingQuery.set(key, value)
  );
  const listingQueryString = listingQuery.toString();

  const mapPins: MapPin[] = results.listings.map((l) => {
    const { lat, lng } = getMapCoordinatesForListing(l);
    let label = "—";
    if (l.pricingRule) {
      const nightly = Number(l.pricingRule.baseNightlyRate);
      const cur = l.pricingRule.currency;
      label =
        nightCount != null
          ? formatPrice(nightly * nightCount, cur)
          : formatPrice(nightly, cur);
    }
    return { id: l.id, slug: l.slug, lat, lng, label, query: listingQueryString };
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <h1 className="sr-only">
        {filters.city ? `Stays in ${filters.city}` : "Explore properties"}
      </h1>
      <div className="flex-1 w-full">
        <Suspense fallback={<div className="animate-pulse h-40 bg-muted mb-8 mx-4 md:mx-8 rounded-xl" />}>
          <PropertiesExplorerClient
            amenities={amenities}
            propertyTypes={propertyTypes}
            availablePropertyTypes={filterPreview.availablePropertyTypes}
            initialFilterPreview={filterPreview}
            totalLabel={totalLabel}
            totalCount={results.total}
            mapPins={mapPins}
          >
            {results.listings.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-10 max-w-6xl">
                  {results.listings.map((listing) => (
                    <PropertyCard
                      key={listing.id}
                      listing={listing}
                      checkIn={filters.checkIn}
                      checkOut={filters.checkOut}
                      nightCount={nightCount}
                      searchQuery={listingQueryString}
                    />
                  ))}
                </div>

                {results.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-12">
                    {results.page > 1 && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={buildPageUrl(results.page - 1)}>
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          Previous
                        </Link>
                      </Button>
                    )}
                    <span className="text-sm text-muted-foreground px-4">
                      Page {results.page} of {results.totalPages}
                    </span>
                    {results.page < results.totalPages && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={buildPageUrl(results.page + 1)}>
                          Next
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                title="No properties found"
                description="Try adjusting your search filters or explore a different area."
              >
                <Button variant="outline" asChild>
                  <Link href="/properties">Clear filters</Link>
                </Button>
              </EmptyState>
            )}
          </PropertiesExplorerClient>
        </Suspense>
      </div>
    </div>
  );
}

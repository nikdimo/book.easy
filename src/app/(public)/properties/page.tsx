import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
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
import { MAP_BOUNDS_PARAM, parseMapBounds } from "@/lib/map-bounds";
import { formatPrice, getNightCount } from "@/lib/utils/format";
import type { MapPin } from "@/components/marketplace/properties-map";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getT, T, ti, tPlural } from "@/lib/i18n/t";
import { getMarketplaceSettings } from "@/lib/services/marketplace-settings.service";
import { computeStayQuote, parseLocalYmd } from "@/lib/utils/stay-pricing";

interface SearchPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata = {
  title: "Explore Properties",
  description: "Browse and search properties around the world",
};

export default async function PropertiesPage({
  searchParams,
}: SearchPageProps) {
  const t = await getT();
  const params = await searchParams;
  const marketplaceSettings = await getMarketplaceSettings();

  const hasSelectedDestination =
    typeof params.city === "string" && params.city.trim().length > 0;
  const exploreAll = params.all === "1";
  if (
    !hasSelectedDestination &&
    !exploreAll &&
    marketplaceSettings.featuredMarketEnabled &&
    marketplaceSettings.featuredCity &&
    marketplaceSettings.featuredCountry
  ) {
    const featuredParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") featuredParams.append(key, value);
      else value?.forEach((item) => featuredParams.append(key, item));
    }
    featuredParams.delete("all");
    featuredParams.set("city", marketplaceSettings.featuredCity);
    featuredParams.set("country", marketplaceSettings.featuredCountry);
    featuredParams.set("featured", "1");
    redirect(`/properties?${featuredParams.toString()}`);
  }

  const propertyTypes = await getActivePropertyTypes();
  const allPropertyTypeValues = propertyTypes.map((t) => t.value);

  const selectedPropertyTypes = parsePropertyTypesSelectionFromParams(
    params,
    allPropertyTypeValues,
  );
  const propertyTypesFilter = propertyTypesForSearchQuery(
    selectedPropertyTypes,
    allPropertyTypeValues,
  );
  const propertyTypesQuery = stringifyPropertyTypesParam(
    selectedPropertyTypes,
    allPropertyTypeValues,
  );

  const filters = {
    city: typeof params.city === "string" ? params.city : undefined,
    country: typeof params.country === "string" ? params.country : undefined,
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
    sort:
      typeof params.sort === "string"
        ? (params.sort as "price_asc" | "price_desc" | "newest")
        : undefined,
    page: params.page ? Number(params.page) : 1,
    bounds:
      parseMapBounds(
        typeof params[MAP_BOUNDS_PARAM] === "string"
          ? params[MAP_BOUNDS_PARAM]
          : undefined,
      ) ?? undefined,
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

  const [results, amenities, filterPreview] = await Promise.all([
    searchListings(filters),
    getAvailableAmenities(),
    getSearchFilterPreview(filters),
  ]);

  function buildPageUrl(page: number) {
    const p = new URLSearchParams();
    if (filters.city) p.set("city", filters.city);
    if (filters.country) p.set("country", filters.country);
    if (params.featured === "1") p.set("featured", "1");
    if (params.all === "1") p.set("all", "1");
    if (filters.checkIn) p.set("checkIn", filters.checkIn);
    if (filters.checkOut) p.set("checkOut", filters.checkOut);
    if (filters.guests) p.set("guests", String(filters.guests));
    Object.entries(guestBreakdownParams).forEach(([key, value]) =>
      p.set(key, value),
    );
    if (filters.minPrice) p.set("minPrice", String(filters.minPrice));
    if (filters.maxPrice) p.set("maxPrice", String(filters.maxPrice));
    if (filters.bedrooms) p.set("bedrooms", String(filters.bedrooms));
    if (propertyTypesQuery) p.set("propertyTypes", propertyTypesQuery);
    if (filters.amenities)
      filters.amenities.forEach((a) => p.append("amenities", a));
    if (filters.sort) p.set("sort", filters.sort);
    if (typeof params[MAP_BOUNDS_PARAM] === "string")
      p.set(MAP_BOUNDS_PARAM, params[MAP_BOUNDS_PARAM]);
    p.set("page", String(page));
    return `/properties?${p.toString()}`;
  }

  const totalLabel =
    filters.checkIn && filters.checkOut
      ? tPlural(
          t,
          "properties.results_with_dates",
          results.total,
          "{n} home · dates applied in filters",
          "{n} homes · dates applied in filters",
        )
      : tPlural(
          t,
          "properties.results",
          results.total,
          "{n} home",
          "{n} homes",
        );

  const nightCount =
    filters.checkIn && filters.checkOut
      ? Math.max(1, getNightCount(filters.checkIn, filters.checkOut))
      : undefined;

  const listingQuery = new URLSearchParams();
  if (filters.city) listingQuery.set("city", filters.city);
  if (filters.country) listingQuery.set("country", filters.country);
  if (filters.checkIn) listingQuery.set("checkIn", filters.checkIn);
  if (filters.checkOut) listingQuery.set("checkOut", filters.checkOut);
  if (filters.guests) listingQuery.set("guests", String(filters.guests));
  Object.entries(guestBreakdownParams).forEach(([key, value]) =>
    listingQuery.set(key, value),
  );
  const listingQueryString = listingQuery.toString();

  const mapPins: MapPin[] = results.listings.flatMap((l) => {
    const coordinates = getMapCoordinatesForListing(l);
    if (!coordinates) return [];
    let label = "—";
    if (l.pricingRule) {
      const nightly = Number(l.pricingRule.baseNightlyRate);
      const cur = l.pricingRule.currency;
      const quote =
        filters.checkIn && filters.checkOut
          ? computeStayQuote({
              baseNightly: nightly,
              cleaningFee: l.pricingRule.cleaningFee,
              checkIn: parseLocalYmd(filters.checkIn),
              checkOut: parseLocalYmd(filters.checkOut),
              overrides: new Map(
                l.priceOverrides.map((row) => [row.date, row.rate]),
              ),
              promotions: l.promotions,
            })
          : null;
      label = quote
        ? formatPrice(quote.total, cur, t.locale)
        : formatPrice(nightly, cur, t.locale);
    }
    return [
      {
        id: l.id,
        slug: l.slug,
        lat: coordinates.lat,
        lng: coordinates.lng,
        label,
        title: l.title,
        location: [l.property.area, l.property.city].filter(Boolean).join(", "),
        imageUrl: l.images.find((image) => image.url?.trim())?.url,
        imageAlt: l.images.find((image) => image.url?.trim())?.alt ?? undefined,
        query: listingQueryString,
      },
    ];
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <h1 className="sr-only">
        {filters.city ? (
          (() => {
            const value = ti(t, "properties.stays_in_city", "Stays in {city}", {
              city: filters.city,
            });
            return (
              <span className={value.translated ? "notranslate" : undefined}>
                {value.text}
              </span>
            );
          })()
        ) : (
          <T t={t} k="properties.explore" source="Explore properties" />
        )}
      </h1>
      <div className="flex-1 w-full">
        <Suspense
          fallback={
            <div className="animate-pulse h-40 bg-muted mb-8 mx-4 md:mx-8 rounded-xl" />
          }
        >
          <PropertiesExplorerClient
            amenities={amenities}
            propertyTypes={propertyTypes}
            availablePropertyTypes={filterPreview.availablePropertyTypes}
            initialFilterPreview={filterPreview}
            totalLabel={totalLabel}
            totalCount={results.total}
            mapPins={mapPins}
            featuredMarket={params.featured === "1"}
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
                      mapListingId={listing.id}
                    />
                  ))}
                </div>

                {results.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-12">
                    {results.page > 1 && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={buildPageUrl(results.page - 1)}>
                          <ChevronLeft className="h-4 w-4 mr-1" />
                          <T t={t} k="pagination.previous" source="Previous" />
                        </Link>
                      </Button>
                    )}
                    <span className="text-sm text-muted-foreground px-4">
                      {(() => {
                        const value = ti(
                          t,
                          "pagination.page_of",
                          "Page {page} of {pages}",
                          { page: results.page, pages: results.totalPages },
                        );
                        return (
                          <span
                            className={
                              value.translated ? "notranslate" : undefined
                            }
                          >
                            {value.text}
                          </span>
                        );
                      })()}
                    </span>
                    {results.page < results.totalPages && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={buildPageUrl(results.page + 1)}>
                          <T t={t} k="pagination.next" source="Next" />
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                title={t.resolve(
                  "properties.none_found",
                  "No properties found",
                )}
                description={t.resolve(
                  "properties.none_description",
                  "Try adjusting your search filters or explore a different area.",
                )}
              >
                <Button variant="outline" asChild>
                  <Link href="/properties">
                    <T
                      t={t}
                      k="properties.clear_filters"
                      source="Clear filters"
                    />
                  </Link>
                </Button>
              </EmptyState>
            )}
          </PropertiesExplorerClient>
        </Suspense>
      </div>
    </div>
  );
}

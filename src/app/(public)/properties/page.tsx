import { Suspense } from "react";
import Link from "next/link";
import { PropertyCard } from "@/components/public/property-card";
import { SearchFilters } from "@/components/public/search-filters";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { searchListings, getAvailableAmenities } from "@/lib/services/search.service";
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

  const filters = {
    city: typeof params.city === "string" ? params.city : undefined,
    checkIn: typeof params.checkIn === "string" ? params.checkIn : undefined,
    checkOut: typeof params.checkOut === "string" ? params.checkOut : undefined,
    guests: params.guests ? Number(params.guests) : undefined,
    minPrice: params.minPrice ? Number(params.minPrice) : undefined,
    maxPrice: params.maxPrice ? Number(params.maxPrice) : undefined,
    propertyType: typeof params.propertyType === "string" ? params.propertyType : undefined,
    amenities: params.amenities
      ? Array.isArray(params.amenities)
        ? params.amenities
        : [params.amenities]
      : undefined,
    sort: typeof params.sort === "string" ? params.sort as "price_asc" | "price_desc" | "newest" : undefined,
    page: params.page ? Number(params.page) : 1,
  };

  const [results, amenities] = await Promise.all([
    searchListings(filters),
    getAvailableAmenities(),
  ]);

  function buildPageUrl(page: number) {
    const p = new URLSearchParams();
    if (filters.city) p.set("city", filters.city);
    if (filters.checkIn) p.set("checkIn", filters.checkIn);
    if (filters.checkOut) p.set("checkOut", filters.checkOut);
    if (filters.guests) p.set("guests", String(filters.guests));
    if (filters.minPrice) p.set("minPrice", String(filters.minPrice));
    if (filters.maxPrice) p.set("maxPrice", String(filters.maxPrice));
    if (filters.propertyType) p.set("propertyType", filters.propertyType);
    if (filters.amenities) filters.amenities.forEach((a) => p.append("amenities", a));
    if (filters.sort) p.set("sort", filters.sort);
    p.set("page", String(page));
    return `/properties?${p.toString()}`;
  }

  return (
    <div className="max-w-[1760px] mx-auto px-4 md:px-8 py-6 md:py-10">
      <div className="mb-8 md:mb-10">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
          {filters.city ? `Stays in ${filters.city}` : "Homes available"}
        </h1>
        <p className="text-muted-foreground text-sm mt-2">
          {results.total} {results.total === 1 ? "home" : "homes"}
          {filters.checkIn && filters.checkOut && " · dates applied in filters"}
        </p>
      </div>

      <div className="flex gap-8">
        <Suspense>
          <SearchFilters amenities={amenities} />
        </Suspense>

        <div className="flex-1">
          {results.listings.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {results.listings.map((listing) => (
                  <PropertyCard key={listing.id} listing={listing} />
                ))}
              </div>

              {results.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
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
        </div>
      </div>
    </div>
  );
}

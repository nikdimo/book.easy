import Link from "next/link";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/public/property-card";
import { PropertyCardSpotlight } from "@/components/public/property-card-spotlight";
import {
  countApprovedListings,
  getFeaturedListings,
  getPopularListings,
} from "@/lib/services/search.service";
import { ListingCarousel } from "@/components/public/listing-carousel";
import { getT, T } from "@/lib/i18n/t";

const HOME_LISTING_LIMIT = 24;
const CAROUSEL_COUNT = 8;

/** Below this many total listings, the compact grid/carousel cards look sparse — a
 * larger editorial layout with a photo collage and real description reads as curated
 * instead of empty. Above it, there's enough inventory to fill a dense grid, so the
 * standard compact cards (see PropertyCard) take over. */
const LOW_INVENTORY_THRESHOLD = 6;

/** A "Popular homes" row is only meaningful when it's a selection out of something —
 * with a handful of listings the carousel is just the same inventory the grid below
 * already shows, reordered. Below this count the home page is one honest list. */
const POPULAR_SECTION_MIN_LISTINGS = 30;

async function loadHomeData() {
  try {
    const [totalListings, scored] = await Promise.all([
      countApprovedListings(),
      getPopularListings(CAROUSEL_COUNT),
    ]);

    // Both conditions matter: enough inventory for a selection to mean something, and
    // enough listings carrying a real demand signal to fill the row. Popularity data
    // accumulates only once guests start browsing (see popularity.service.ts), so on a
    // fresh deployment this is simply false and the section stays hidden rather than
    // labelling an arbitrary ordering "popular".
    const showPopular =
      totalListings >= POPULAR_SECTION_MIN_LISTINGS && scored.length >= CAROUSEL_COUNT;
    const popularListings = showPopular ? scored : [];

    const listings = await getFeaturedListings(
      HOME_LISTING_LIMIT,
      popularListings.map((listing) => listing.id)
    );

    return { totalListings, popularListings, listings, dbError: null as string | null };
  } catch (e) {
    const empty = { totalListings: 0, popularListings: [], listings: [] };
    if (e instanceof PrismaClientKnownRequestError && e.code === "P5010") {
      return {
        ...empty,
        dbError:
          "Database unreachable (P5010). For local dev use DATABASE_URL=postgresql://… pointing at Postgres on your machine.",
      };
    }
    return {
      ...empty,
      dbError:
        "Could not load listings. Start PostgreSQL, run prisma db push && prisma db seed, and check DATABASE_URL in .env.",
    };
  }
}

export default async function HomePage() {
  const t = await getT();
  const { totalListings, popularListings, listings, dbError } = await loadHomeData();
  const isLowInventory = totalListings > 0 && totalListings <= LOW_INVENTORY_THRESHOLD;
  const showPopular = popularListings.length > 0;

  return (
    <div className="bg-background">
      {dbError && (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 text-center border-b border-destructive/20">
          {dbError}
        </div>
      )}

      <h1 className="sr-only"><T t={t} k="home.page_title" source="Find places to stay in North Macedonia" /></h1>

      {isLowInventory && (
        <section className="max-w-[1760px] mx-auto px-4 md:px-8 pt-6 pb-8">
          <h2 className="text-base md:text-lg font-semibold tracking-tight mb-4">
            <T t={t} k="home.featured_stays" source="Featured stays" />
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {listings.map((listing) => (
              <PropertyCardSpotlight key={listing.id} listing={listing} />
            ))}
          </div>
        </section>
      )}

      {!isLowInventory && showPopular && (
        <section className="max-w-[1760px] mx-auto px-4 md:px-8 pt-4 pb-2">
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-semibold tracking-tight">
                <T t={t} k="home.popular_homes" source="Popular homes" />
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                <T
                  t={t}
                  k="home.popular_homes_subtitle"
                  source="Most viewed and booked in the last few weeks"
                />
              </p>
            </div>
            <Button
              variant="outline"
              className="rounded-full shrink-0 hidden sm:inline-flex text-xs h-7 px-4"
              asChild
            >
              <Link href="/properties"><T t={t} k="home.show_all" source="Show all" /></Link>
            </Button>
          </div>
          <ListingCarousel listings={popularListings} />
        </section>
      )}

      {!isLowInventory && listings.length > 0 && (
        <section className="max-w-[1760px] mx-auto px-4 md:px-8 pt-6 pb-8">
          <h2 className="text-base md:text-lg font-semibold tracking-tight mb-4">
            {showPopular ? (
              <T t={t} k="home.more_places" source="More places to stay" />
            ) : (
              <T t={t} k="home.places_to_stay" source="Places to stay" />
            )}
          </h2>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-6">
            {listings.map((listing) => (
              <div
                key={listing.id}
                className="w-full min-[420px]:w-[calc(50%-0.5rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.75rem)] lg:w-[calc(20%-0.8rem)]"
              >
                <PropertyCard listing={listing} />
              </div>
            ))}
          </div>
          {totalListings > listings.length + popularListings.length && (
            <div className="mt-6 flex justify-center">
              <Button variant="outline" className="rounded-full" asChild>
                <Link href="/properties"><T t={t} k="home.show_all_homes" source="Show all homes" /></Link>
              </Button>
            </div>
          )}
        </section>
      )}

      {totalListings === 0 && !dbError && (
        <section className="max-w-[1760px] mx-auto px-4 md:px-8 py-16 text-center">
          <p className="text-muted-foreground">
            <T t={t} k="home.no_listings" source="No listings yet. Check back soon!" />
          </p>
        </section>
      )}
    </div>
  );
}

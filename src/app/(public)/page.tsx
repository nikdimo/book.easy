import Link from "next/link";
import Image from "next/image";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/public/property-card";
import { PropertyCardSpotlight } from "@/components/public/property-card-spotlight";
import {
  countApprovedListings,
  getAvailableCities,
  getAvailablePropertyTypesByCity,
  getFeaturedListings,
  getPopularListings,
} from "@/lib/services/search.service";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { ListingCarousel } from "@/components/public/listing-carousel";
import { HomeListingsView } from "@/components/public/home-listings-view";
import { OwnerServicesDialog } from "@/components/public/owner-services-dialog";
import { FloatingHomeSearch } from "@/components/public/floating-home-search";
import { HomeHeroShell } from "@/components/public/home-hero-shell";
import { CompactHomeSearch } from "@/components/public/compact-home-search";
import { MarketplaceSearchBar } from "@/components/marketplace/marketplace-search-bar";
import type { MapPin } from "@/components/marketplace/properties-map";
import { getMapCoordinatesForListing } from "@/lib/utils/listing-map-coords";
import { getPriceFormatter } from "@/lib/currency/price";
import type { ListingCardSerialized } from "@/lib/serializers/listing-card";
import { getT, T, type Translator } from "@/lib/i18n/t";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import type { PlaceOption } from "@/lib/utils/place";

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

async function loadHeroSearchData(): Promise<{
  popularCities: PlaceOption[];
  availablePropertyTypesByCity: Record<string, string[]>;
  propertyTypes: PropertyTypeOption[];
}> {
  try {
    const [popularCities, availablePropertyTypesByCity, propertyTypes] =
      await Promise.all([
        getAvailableCities(),
        getAvailablePropertyTypesByCity(),
        getActivePropertyTypes(),
      ]);
    return { popularCities, availablePropertyTypesByCity, propertyTypes };
  } catch {
    return {
      popularCities: [],
      availablePropertyTypesByCity: {},
      propertyTypes: [],
    };
  }
}

/** Map markers for the home page's map view. No search dates here, so the marker label
 * is the nightly rate rather than a stay total (see /properties, which has both).
 * Listings without coordinates simply don't get a pin. */
function toMapPins(
  listings: ListingCardSerialized[],
  price: Awaited<ReturnType<typeof getPriceFormatter>>,
): MapPin[] {
  return listings.flatMap((listing) => {
    const coordinates = getMapCoordinatesForListing(listing);
    if (!coordinates) return [];
    const cover = listing.images.find((image) => image.url?.trim());
    return [
      {
        id: listing.id,
        slug: listing.slug,
        lat: coordinates.lat,
        lng: coordinates.lng,
        label: listing.pricingRule
          ? price.format(
              listing.pricingRule.baseNightlyRate,
              listing.pricingRule.currency,
            ).text
          : "—",
        title: listing.title,
        location: [listing.property.area, listing.property.city]
          .filter(Boolean)
          .join(", "),
        imageUrl: cover?.url,
        imageAlt: cover?.alt ?? undefined,
      },
    ];
  });
}

function CompactGrid({ listings }: { listings: ListingCardSerialized[] }) {
  return (
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
  );
}

function SpotlightGrid({ listings }: { listings: ListingCardSerialized[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {listings.map((listing) => (
        <PropertyCardSpotlight key={listing.id} listing={listing} />
      ))}
    </div>
  );
}

function OwnerGrowthHero({
  t,
  popularCities,
  availablePropertyTypesByCity,
  propertyTypes,
}: {
  t: Translator;
  popularCities: PlaceOption[];
  availablePropertyTypesByCity: Record<string, string[]>;
  propertyTypes: PropertyTypeOption[];
}) {
  return (
    <section className="w-full md:-mt-20" aria-labelledby="owner-growth-title">
      <div className="relative min-h-[410px] w-full overflow-hidden bg-white md:min-h-[500px]">
        <Image
          src="/images/owner-hero-apartment.png"
          alt={
            t.resolve(
              "home.owner_hero.image_alt",
              "Modern coastal apartment living room overlooking the harbor",
            ).text
          }
          fill
          priority
          sizes="(max-width: 768px) 100vw, 1760px"
          className="object-cover object-[64%_center] opacity-[0.68] saturate-[0.88] md:object-center"
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(ellipse_70%_58%_at_50%_72%,rgba(8,15,25,0.58)_0%,rgba(8,15,25,0.38)_48%,rgba(8,15,25,0.08)_76%,transparent_100%)]"
          aria-hidden="true"
        />

        <div className="relative z-10 flex min-h-[410px] select-none flex-col items-center justify-center px-6 py-8 md:min-h-[500px] md:px-12 md:pt-24">
          <div className="w-full max-w-5xl select-auto" data-home-hero-search>
            <div className="@container mx-auto w-full max-w-md md:hidden">
              <MarketplaceSearchBar
                variant="summary"
                popularCities={popularCities}
                availablePropertyTypesByCity={availablePropertyTypesByCity}
                propertyTypes={propertyTypes}
              />
            </div>
            <div className="hidden md:block">
              <MarketplaceSearchBar
                variant="pill"
                popularCities={popularCities}
                availablePropertyTypesByCity={availablePropertyTypesByCity}
                propertyTypes={propertyTypes}
              />
            </div>
          </div>

          <div className="mx-auto mt-7 w-full max-w-[80rem] text-center">
            <h2
              id="owner-growth-title"
              className="mx-auto max-w-[80rem] break-words text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-[clamp(2rem,3.2vw,3.5rem)]"
            >
              <T
                t={t}
                k="home.owner_hero.title"
                source="No service fees. Book direct with hosts."
              />
            </h2>
            <p className="mx-auto mt-4 max-w-[60rem] break-words text-base leading-relaxed text-white/85 sm:text-lg">
              <T
                t={t}
                k="home.owner_hero.description"
                source="Book directly with hosts and save up to 20%—no service fees."
              />
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <OwnerServicesDialog />
              <Button size="lg" className="rounded-full px-6" asChild>
                <Link href="/account/become-host">
                  <T
                    t={t}
                    k="header.list_your_property"
                    source="List your property"
                  />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default async function HomePage() {
  const t = await getT();
  const [homeData, heroSearchData, price] = await Promise.all([
    loadHomeData(),
    loadHeroSearchData(),
    getPriceFormatter(),
  ]);
  const { totalListings, popularListings, listings, dbError } = homeData;
  const isLowInventory = totalListings > 0 && totalListings <= LOW_INVENTORY_THRESHOLD;
  const showPopular = popularListings.length > 0;

  return (
    <div className="bg-background">
      {dbError && (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 text-center border-b border-destructive/20">
          {dbError}
        </div>
      )}

      <h1 className="sr-only"><T t={t} k="home.page_title" source="Find places to stay around the world" /></h1>

      {/* The shell steps the hero aside in map view so the map starts at the fold. */}
      <HomeHeroShell>
        <OwnerGrowthHero t={t} {...heroSearchData} />
      </HomeHeroShell>
      <FloatingHomeSearch {...heroSearchData} />

      {isLowInventory && (
        <section className="max-w-[1760px] mx-auto px-4 md:px-8 pt-6 pb-8">
          <HomeListingsView
            heading={<T t={t} k="home.featured_stays" source="Featured stays" />}
            defaultView="detailed"
            pins={toMapPins(listings, price)}
            detailed={<SpotlightGrid listings={listings} />}
            compact={<CompactGrid listings={listings} />}
            mapSearch={
              <CompactHomeSearch {...heroSearchData} desktopClassName="md:w-auto" />
            }
          />
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
          <HomeListingsView
            heading={
              showPopular ? (
                <T t={t} k="home.more_places" source="More places to stay" />
              ) : (
                <T t={t} k="home.places_to_stay" source="Places to stay" />
              )
            }
            defaultView="compact"
            // Everything on screen, so the map matches the page rather than one section.
            pins={toMapPins([...popularListings, ...listings], price)}
            compact={<CompactGrid listings={listings} />}
            detailed={<SpotlightGrid listings={listings} />}
            mapSearch={
              <CompactHomeSearch {...heroSearchData} desktopClassName="md:w-auto" />
            }
            footer={
              totalListings > listings.length + popularListings.length ? (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" className="rounded-full" asChild>
                    <Link href="/properties">
                      <T t={t} k="home.show_all_homes" source="Show all homes" />
                    </Link>
                  </Button>
                </div>
              ) : null
            }
          />
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

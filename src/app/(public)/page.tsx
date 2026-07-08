import Link from "next/link";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/public/property-card";
import { getFeaturedListings } from "@/lib/services/search.service";
import { ListingCarousel } from "@/components/public/listing-carousel";

const CAROUSEL_COUNT = 8;

async function loadHomeData() {
  try {
    const listings = await getFeaturedListings(24);
    return { listings, dbError: null as string | null };
  } catch (e) {
    if (e instanceof PrismaClientKnownRequestError && e.code === "P5010") {
      return {
        listings: [],
        dbError:
          "Database unreachable (P5010). For local dev use DATABASE_URL=postgresql://… pointing at Postgres on your machine.",
      };
    }
    return {
      listings: [],
      dbError:
        "Could not load listings. Start PostgreSQL, run prisma db push && prisma db seed, and check DATABASE_URL in .env.",
    };
  }
}

export default async function HomePage() {
  const { listings, dbError } = await loadHomeData();
  const carouselListings = listings.slice(0, CAROUSEL_COUNT);
  const gridListings = listings.slice(CAROUSEL_COUNT);

  return (
    <div className="bg-background">
      {dbError && (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 text-center border-b border-destructive/20">
          {dbError}
        </div>
      )}

      <h1 className="sr-only">Find places to stay in North Macedonia</h1>

      {carouselListings.length > 0 && (
        <section className="max-w-[1760px] mx-auto px-4 md:px-8 pt-4 pb-2">
          <div className="flex items-center justify-between gap-4 mb-3">
            <h2 className="text-base md:text-lg font-semibold tracking-tight">
              Popular homes
            </h2>
            <Button
              variant="outline"
              className="rounded-full shrink-0 hidden sm:inline-flex text-xs h-7 px-4"
              asChild
            >
              <Link href="/properties">Show all</Link>
            </Button>
          </div>
          <ListingCarousel listings={carouselListings} />
        </section>
      )}

      {gridListings.length > 0 && (
        <section className="max-w-[1760px] mx-auto px-4 md:px-8 pt-6 pb-8">
          <h2 className="text-base md:text-lg font-semibold tracking-tight mb-4">
            More places to stay
          </h2>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-6">
            {gridListings.map((listing) => (
              <PropertyCard key={listing.id} listing={listing} />
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <Button variant="outline" className="rounded-full" asChild>
              <Link href="/properties">Show all homes</Link>
            </Button>
          </div>
        </section>
      )}

      {listings.length === 0 && !dbError && (
        <section className="max-w-[1760px] mx-auto px-4 md:px-8 py-16 text-center">
          <p className="text-muted-foreground">
            No listings yet. Check back soon!
          </p>
        </section>
      )}

      <section className="border-t bg-muted/40 mt-2">
        <div className="max-w-[1760px] mx-auto px-4 md:px-8 py-10 md:py-14 text-center">
          <h2 className="text-lg md:text-2xl font-semibold mb-2">
            Hosting opens doors
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto text-xs md:text-sm">
            Share your space, set your availability, and welcome guests when
            you&apos;re ready.
          </p>
          <Button size="lg" className="rounded-full px-8" asChild>
            <Link href="/account/become-host">Try hosting</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

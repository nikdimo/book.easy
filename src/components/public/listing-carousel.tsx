import { ListingCarouselClient } from "@/components/public/listing-carousel-client";
import { PropertyCard } from "@/components/public/property-card";
import type { ListingCardSerialized } from "@/lib/serializers/listing-card";

/** Below this count, cards fit in a single row on every breakpoint — a scrollable
 * carousel would just leave a stub of cards stuck to the left with empty space next
 * to it, so a centered wrapping row reads better than scroll affordances nobody needs. */
const SCROLLABLE_THRESHOLD = 5;

export async function ListingCarousel({
  listings,
}: {
  listings: ListingCardSerialized[];
}) {
  if (listings.length === 0) return null;

  if (listings.length < SCROLLABLE_THRESHOLD) {
    return (
      <div className="flex flex-wrap justify-center gap-4">
        {listings.map((listing) => (
          <div
            key={listing.id}
            className="w-full min-[420px]:w-[calc(50%-0.5rem)] sm:w-[calc(33.333%-0.667rem)] md:w-[calc(25%-0.75rem)] lg:w-[calc(19%-0.8rem)]"
          >
            <PropertyCard listing={listing} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <ListingCarouselClient>
      {listings.map((listing) => (
        <div
          key={listing.id}
          data-carousel-card
          className="flex-none w-full sm:w-[47%] md:w-[32%] lg:w-[24%] xl:w-[19%] snap-start"
        >
          <PropertyCard listing={listing} />
        </div>
      ))}
    </ListingCarouselClient>
  );
}

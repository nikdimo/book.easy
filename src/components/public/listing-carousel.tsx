import { ListingCarouselClient } from "@/components/public/listing-carousel-client";
import { PropertyCard } from "@/components/public/property-card";
import type { ListingCardSerialized } from "@/lib/serializers/listing-card";

export async function ListingCarousel({
  listings,
}: {
  listings: ListingCardSerialized[];
}) {
  if (listings.length === 0) return null;

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

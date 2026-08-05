import { MapPin } from "lucide-react";
import { getT, T } from "@/lib/i18n/t";
/** The same centre-pin map the host aims when they create the listing, reused here so
 *  the pin a guest sees is the pin the host placed. It only touches the Google Maps SDK
 *  from an effect, so it is safe to render straight from this server component. */
import ListingLocationPickerInner from "@/components/host/listing-location-picker-inner";

/** Roughly how far the shown pin sits from the real front door, in metres. Big enough
 *  that the building can't be picked out of a street, small enough that the guest still
 *  learns which part of town they'd be staying in. */
const APPROXIMATION_RADIUS_M = 200;
const METRES_PER_DEGREE_LAT = 111_320;

/** A stable pseudo-random angle per listing. The offset must not change between renders
 *  — a pin that wanders on every page load would let anyone average the noise away and
 *  recover the exact spot. */
function offsetAngle(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return ((hash >>> 0) % 3600) / 3600 * Math.PI * 2;
}

export async function ListingLocationMap({
  listingId,
  latitude,
  longitude,
  locationLine,
}: {
  listingId: string;
  latitude: number | null;
  longitude: number | null;
  locationLine: string;
}) {
  if (
    latitude === null ||
    longitude === null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const t = await getT();
  const angle = offsetAngle(listingId);
  const latOffset =
    (APPROXIMATION_RADIUS_M * Math.sin(angle)) / METRES_PER_DEGREE_LAT;
  const lngOffset =
    (APPROXIMATION_RADIUS_M * Math.cos(angle)) /
    (METRES_PER_DEGREE_LAT * Math.max(Math.cos((latitude * Math.PI) / 180), 0.01));

  return (
    <section className="space-y-4" aria-labelledby="listing-location-heading">
      <div>
        <h2 id="listing-location-heading" className="text-xl font-semibold">
          <T t={t} k="listing.location_heading" source="Where you'll be" />
        </h2>
        <p
          className="notranslate mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"
          translate="no"
        >
          <MapPin className="h-4 w-4 shrink-0" />
          {locationLine}
        </p>
      </div>

      {/* Ring + soft shadow rather than a plain border: the map is the only full-bleed
          colour block in this column, so it needs to sit on the page as a card. */}
      <div className="relative overflow-hidden rounded-2xl shadow-sm ring-1 ring-border">
        <div className="h-[260px] w-full sm:h-[340px]">
          <ListingLocationPickerInner
            lat={latitude + latOffset}
            lng={longitude + lngOffset}
            hasPin={false}
            zoom={15}
            interactive={false}
            className="h-full w-full"
            onChange={() => undefined}
          />
        </div>
        {/* Keeps the pin legible over bright map tiles and ties the card's bottom edge
            into the caption. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-background/85 to-transparent"
          aria-hidden="true"
        />
        <p className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-4 pb-3 text-xs text-muted-foreground">
          <T
            t={t}
            k="listing.location_approximate"
            source="Approximate location. The exact address is shared once your booking is confirmed."
          />
        </p>
      </div>
    </section>
  );
}

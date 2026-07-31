import { Lock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyStreetView } from "@/components/public/property-street-view";
import {
  EXACT_LOCATION_UNLOCK_DAYS,
  canSeeExactLocation,
  exactLocationUnlocksAt,
} from "@/lib/utils/street-view-access";
import { formatDate } from "@/lib/utils/format";

type ArrivalProperty = {
  address: string | null;
  city: string | null;
  area: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  streetViewPanoId: string | null;
  streetViewHeading: number | null;
  streetViewPitch: number | null;
};

/** Everything a guest needs to actually find the door, shown only once
 *  canSeeExactLocation allows it. Before that the card still renders — a guest who
 *  can't see the address yet should know it exists and when it arrives, rather than
 *  wonder whether the host forgot to add it. */
export function BookingArrivalDetails({
  booking,
  property,
}: {
  booking: { status: string; checkIn: Date };
  property: ArrivalProperty;
}) {
  const unlocked = canSeeExactLocation(booking);
  const hasStreetView =
    property.latitude != null &&
    property.longitude != null &&
    property.streetViewPanoId &&
    property.streetViewHeading != null &&
    property.streetViewPitch != null;

  const fullAddress = [
    property.address,
    property.postalCode && property.city
      ? `${property.postalCode} ${property.city}`
      : property.city,
    property.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {unlocked ? (
            <MapPin className="h-4 w-4" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          Finding the place
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {unlocked ? (
          <>
            {fullAddress && (
              <div>
                <p className="text-muted-foreground">Address</p>
                <p className="mt-1 font-medium">{fullAddress}</p>
              </div>
            )}
            {hasStreetView && (
              <div>
                <p className="text-muted-foreground">
                  The host picked this view so you can recognise the building.
                </p>
                <div className="mt-1">
                  <PropertyStreetView
                    latitude={property.latitude!}
                    longitude={property.longitude!}
                    panoId={property.streetViewPanoId!}
                    heading={property.streetViewHeading!}
                    pitch={property.streetViewPitch!}
                  />
                </div>
              </div>
            )}
            {!fullAddress && !hasStreetView && (
              <p className="text-muted-foreground">
                The host hasn&apos;t added arrival details for this property.
                Message them to arrange how you&apos;ll get in.
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            {booking.status === "CONFIRMED"
              ? `The exact address and the host's Street View of the entrance become available on ${formatDate(
                  exactLocationUnlocksAt(booking.checkIn)
                )}, ${EXACT_LOCATION_UNLOCK_DAYS} days before check-in.`
              : `Once the host confirms this booking, the exact address and their Street View of the entrance appear here ${EXACT_LOCATION_UNLOCK_DAYS} days before check-in.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

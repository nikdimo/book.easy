import { Lock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PropertyStreetView } from "@/components/public/property-street-view";
import {
  EXACT_LOCATION_UNLOCK_DAYS,
  canSeeExactLocation,
  exactLocationUnlocksAt,
} from "@/lib/utils/street-view-access";
import { formatDate } from "@/lib/utils/format";
import { getT, T, ti } from "@/lib/i18n/t";

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
export async function BookingArrivalDetails({
  booking,
  property,
}: {
  booking: { status: string; checkIn: Date };
  property: ArrivalProperty;
}) {
  const t = await getT();
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
          <T t={t} k="account.arrival.heading" source="Finding the place" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {unlocked ? (
          <>
            {fullAddress && (
              <div>
                <p className="text-muted-foreground"><T t={t} k="account.arrival.address" source="Address" /></p>
                <p className="mt-1 font-medium" data-user-generated-content translate="yes">{fullAddress}</p>
              </div>
            )}
            {hasStreetView && (
              <div>
                <p className="text-muted-foreground">
                  <T t={t} k="account.arrival.street_view_hint" source="The host picked this view so you can recognise the building." />
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
                <T t={t} k="account.arrival.empty" source="The host hasn't added arrival details for this property. Message them to arrange how you'll get in." />
              </p>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">
            {booking.status === "CONFIRMED"
              ? ti(t, "account.arrival.unlock_date", "The exact address and the host's Street View of the entrance become available on {date}, {days} days before check-in.", {
                  date: formatDate(exactLocationUnlocksAt(booking.checkIn)),
                  days: EXACT_LOCATION_UNLOCK_DAYS,
                }).text
              : ti(t, "account.arrival.unlock_after_confirmation", "Once the host confirms this booking, the exact address and their Street View of the entrance appear here {days} days before check-in.", {
                  days: EXACT_LOCATION_UNLOCK_DAYS,
                }).text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

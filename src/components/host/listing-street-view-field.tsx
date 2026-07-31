"use client";

import * as React from "react";
import { Check, Lock } from "lucide-react";
import {
  StreetViewPicker,
  type StreetViewSelection,
} from "@/components/host/street-view-picker";
import {
  finiteCoordinate,
  type ListingLocationValue,
} from "@/components/host/listing-location-field";
import { EXACT_LOCATION_UNLOCK_DAYS } from "@/lib/utils/street-view-access";

/** Step 3 of 3 for location, and the only optional one — plenty of addresses have no
 *  panorama within range, so this must never block publishing. */
export function ListingStreetViewField({
  value,
  onChange,
  heading = true,
}: {
  value: ListingLocationValue;
  onChange: (patch: Partial<ListingLocationValue>) => void;
  heading?: boolean;
}) {
  const latitude = finiteCoordinate(value.latitude, -90, 90);
  const longitude = finiteCoordinate(value.longitude, -180, 180);
  const hasPin = latitude !== null && longitude !== null;
  const selection = React.useMemo(
    () =>
      value.streetViewPanoId &&
      Number.isFinite(Number(value.streetViewHeading)) &&
      Number.isFinite(Number(value.streetViewPitch))
        ? {
            panoId: value.streetViewPanoId,
            heading: Number(value.streetViewHeading),
            pitch: Number(value.streetViewPitch),
          }
        : null,
    [value.streetViewHeading, value.streetViewPanoId, value.streetViewPitch]
  );

  const handleUseView = React.useCallback(
    (next: StreetViewSelection) => {
      onChange({
        streetViewHeading: String(next.heading),
        streetViewPitch: String(next.pitch),
        streetViewPanoId: next.panoId,
      });
    },
    [onChange]
  );

  return (
    <div className="notranslate space-y-4">
      {heading && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Street View</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Turn the camera to what guests see when they arrive. Optional.
          </p>
        </div>
      )}

      <p className="flex items-start gap-2 text-sm md:text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>
          Never public — guests see this only once you confirm their booking,{" "}
          {EXACT_LOCATION_UNLOCK_DAYS} days before check-in.
        </span>
      </p>

      {hasPin ? (
        <>
          <StreetViewPicker
            key={`${latitude.toFixed(5)},${longitude.toFixed(5)}`}
            latitude={latitude}
            longitude={longitude}
            initialSelection={selection}
            onUseView={handleUseView}
            compact
          />
          {selection && (
            <p className="flex items-center gap-2 text-sm md:text-xs text-muted-foreground">
              <Check className="h-4 w-4 shrink-0 text-primary" />
              View saved automatically.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-destructive">
          Place the pin on the map first, then pick the view guests should see.
        </p>
      )}

      <input
        type="hidden"
        name="streetViewHeading"
        value={value.streetViewHeading}
      />
      <input type="hidden" name="streetViewPitch" value={value.streetViewPitch} />
      <input type="hidden" name="streetViewPanoId" value={value.streetViewPanoId} />
    </div>
  );
}

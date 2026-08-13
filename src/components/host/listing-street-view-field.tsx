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
import { Tx, useI18n } from "@/lib/i18n/client";

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
  const { resolve } = useI18n();
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
    <div className="space-y-3 md:space-y-4">
      {heading && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight md:text-2xl"><Tx k="host.street_view.title" source="Street View" /></h2>
          <p className="mt-1 text-xs text-muted-foreground md:text-sm">
            <Tx k="host.street_view.hint" source="Turn the camera to what guests see when they arrive. Optional." />
          </p>
        </div>
      )}

      <p className="flex items-start gap-2 text-sm md:text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <span>{resolve("host.street_view.privacy", "Never public — guests see this only once you confirm their booking, {days} days before check-in.").text.replace("{days}", String(EXACT_LOCATION_UNLOCK_DAYS))}</span>
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
              <Tx k="host.street_view.saved" source="View saved automatically." />
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-destructive">
          <Tx k="host.street_view.pin_first" source="Place the pin on the map first, then pick the view guests should see." />
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

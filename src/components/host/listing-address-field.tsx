"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Loader2, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  finiteCoordinate,
  type ListingLocationValue,
} from "@/components/host/listing-location-field";

const ListingLocationPickerInner = dynamic(
  () => import("./listing-location-picker-inner"),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-muted" />,
  }
);

export type ListingAddressFieldName =
  | "address"
  | "city"
  | "area"
  | "postalCode"
  | "country";

/** Step 2 of 3 for location: check the address the pin produced.
 *
 *  Every field here is prefilled by the geocoder from the previous step, so this is a
 *  verification screen, not a data-entry one — reverse geocoding is reliably close but
 *  routinely wrong about house numbers and building names. */
export function ListingAddressField({
  value,
  onChange,
  resolving = false,
  errors,
  heading = true,
}: {
  value: ListingLocationValue;
  onChange: (field: ListingAddressFieldName, next: string) => void;
  /** The geocoder on the previous step is still filling these in. */
  resolving?: boolean;
  errors?: Partial<Record<"address" | "city" | "country", string>>;
  heading?: boolean;
}) {
  const latitude = finiteCoordinate(value.latitude, -90, 90);
  const longitude = finiteCoordinate(value.longitude, -180, 180);
  const hasPin = latitude !== null && longitude !== null;
  const fieldClass = cn(
    "transition-colors duration-300",
    resolving && "animate-pulse border-primary/30 bg-primary/[0.04]"
  );

  return (
    <div className="notranslate space-y-4">
      {heading && (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Confirm your address
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We filled this in from the pin you placed. Correct anything that
            isn&apos;t right — especially the street number.
          </p>
        </div>
      )}

      {hasPin && (
        <div className="flex items-stretch gap-3 overflow-hidden rounded-xl border">
          <div className="relative h-28 w-36 shrink-0 bg-muted">
            <ListingLocationPickerInner
              lat={latitude}
              lng={longitude}
              hasPin
              zoom={16}
              interactive={false}
              className="h-full w-full"
              onChange={() => undefined}
            />
          </div>
          <p className="flex items-center gap-2 py-3 pr-3 text-sm md:text-xs text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <span>
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </span>
          </p>
        </div>
      )}

      <div className="space-y-3" aria-busy={resolving}>
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2 text-sm md:text-xs font-medium text-primary",
            !resolving && "hidden"
          )}
          aria-live="polite"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Filling in the address details…</span>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location-address">Address</Label>
          <Input
            id="location-address"
            value={value.address}
            onChange={(event) => onChange("address", event.target.value)}
            placeholder="Street and building number"
            disabled={resolving}
            className={fieldClass}
          />
          {errors?.address && (
            <p className="text-sm md:text-xs text-destructive">{errors.address}</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="location-city">City</Label>
            <Input
              id="location-city"
              value={value.city}
              onChange={(event) => onChange("city", event.target.value)}
              disabled={resolving}
              className={fieldClass}
            />
            {errors?.city && (
              <p className="text-sm md:text-xs text-destructive">{errors.city}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location-postal">Postal code</Label>
            <Input
              id="location-postal"
              value={value.postalCode}
              onChange={(event) => onChange("postalCode", event.target.value)}
              disabled={resolving}
              className={fieldClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="location-area">Area</Label>
            <Input
              id="location-area"
              value={value.area}
              onChange={(event) => onChange("area", event.target.value)}
              disabled={resolving}
              className={fieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location-country">Country</Label>
            <Input
              id="location-country"
              value={value.country}
              onChange={(event) => onChange("country", event.target.value)}
              disabled={resolving}
              className={fieldClass}
            />
            {errors?.country && (
              <p className="text-sm md:text-xs text-destructive">{errors.country}</p>
            )}
          </div>
        </div>
      </div>

      {/* No confirm button here — Continue is the confirmation. A second CTA next to
         it just made the host click twice for one decision. */}
      <p
        className={cn(
          "text-sm md:text-xs text-muted-foreground",
          !hasPin && "text-destructive"
        )}
      >
        {hasPin
          ? "Guests only see the city and area until a booking is confirmed."
          : "Go back and place the pin on the map first."}
      </p>

      {/* The wizard hides inactive steps with CSS rather than unmounting them, but
         these still back autosave and publishing for the address text. */}
      <input type="hidden" name="address" value={value.address} />
      <input type="hidden" name="city" value={value.city} />
      <input type="hidden" name="area" value={value.area} />
      <input type="hidden" name="postalCode" value={value.postalCode} />
      <input type="hidden" name="country" value={value.country} />
    </div>
  );
}

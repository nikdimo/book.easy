"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { validCoordinates } from "@/lib/host/v2/listing-location";
import { reviewHref, stepNextTarget } from "@/lib/host/v2/listing-flow-return";
import { Tx } from "@/lib/i18n/client";
import type { ListingSpaceTypeValue } from "@/lib/types/listing-space-type";
import type { PropertyTypeOption } from "@/lib/types/property-type";
import { ListingFlowFooter } from "./listing-flow-footer";
import { useHostStartDraft } from "./host-start-draft-provider";

const LocationMap = dynamic(
  () => import("@/components/host/listing-location-picker-inner"),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse bg-slate-100" aria-hidden />,
  },
);

/** The explicit map checkpoint after the address lookup. Autocomplete gives us useful
 * coordinates, but it cannot tell whether a pin is on the host's entrance, the next
 * building, or the middle of a large property. */
export function AddressStep({
  propertyType,
  spaceType,
  returnToReview = false,
}: {
  propertyType: PropertyTypeOption;
  spaceType: ListingSpaceTypeValue;
  returnToReview?: boolean;
  /** Kept source-compatible with callers of the former address-fields screen. */
  initialAddress?: string;
  initialTouched?: boolean;
}) {
  const { data, save } = useHostStartDraft();
  const storedLatitude = Number(data.latitude);
  const storedLongitude = Number(data.longitude);
  const initiallyPinned =
    (data.latitude ?? "").trim() !== "" &&
    (data.longitude ?? "").trim() !== "" &&
    validCoordinates(storedLatitude, storedLongitude);
  const [pin, setPin] = useState({
    latitude: initiallyPinned ? storedLatitude : 20,
    longitude: initiallyPinned ? storedLongitude : 0,
    placed: initiallyPinned,
  });
  const query = `propertyType=${encodeURIComponent(propertyType.value)}&spaceType=${encodeURIComponent(spaceType)}`;
  const { href: nextHref, label: nextLabel, route: nextRoute } = stepNextTarget(
    returnToReview,
    query,
    `/host/start/basics?${query}`,
  );
  const addressLine = [data.address, data.area, data.city, data.postalCode, data.country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <main className="flex min-h-0 flex-1 px-5 pb-28 pt-5 md:items-center md:px-8 md:pb-24 md:pt-2">
        <div className="mx-auto w-full max-w-[50rem]">
          <div className="text-center">
            <h1 className="font-heading text-[2rem] font-semibold tracking-[-0.025em] text-slate-950 sm:text-[2.35rem]">
              <Tx k="host.v2.map_pin.heading" source="Is the pin in the right spot?" />
            </h1>
            <p className="mx-auto mt-2 max-w-[36rem] text-sm leading-6 text-slate-500">
              <Tx
                k="host.v2.map_pin.hint"
                source="Move the map until the pin marks the property entrance guests should use."
              />
            </p>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-[0_5px_24px_rgba(15,23,42,0.1)]">
            <LocationMap
              lat={pin.latitude}
              lng={pin.longitude}
              hasPin={pin.placed}
              zoom={initiallyPinned ? 17 : 2}
              onChange={(latitude, longitude) =>
                setPin({ latitude, longitude, placed: true })
              }
              className="h-[min(52dvh,29rem)] min-h-[19rem] w-full"
            />
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-600">
            <MapPin className="mt-0.5 size-4 shrink-0 text-slate-500" aria-hidden />
            <span>
              {addressLine ? (
                <span className="notranslate font-medium text-slate-800" translate="no">
                  {addressLine}
                </span>
              ) : (
                <Tx k="host.v2.map_pin.no_address" source="No address has been saved yet." />
              )}
              {" "}
              <Tx
                k="host.v2.map_pin.privacy"
                source="Guests browsing your listing see only an approximate area, never this exact pin."
              />
            </span>
          </div>

          {!pin.placed && (
            <p role="status" className="mt-3 text-center text-sm text-amber-700">
              <Tx
                k="host.v2.map_pin.place_first"
                source="Tap or move the map to place the property pin."
              />
            </p>
          )}
        </div>
      </main>

      <ListingFlowFooter
        backHref={returnToReview ? reviewHref(query) : `/host/start/location?${query}`}
        nextLabel={nextLabel}
        onNext={async () => {
          if (!pin.placed || !validCoordinates(pin.latitude, pin.longitude)) return;
          const coordinatesChanged =
            !initiallyPinned ||
            pin.latitude !== storedLatitude ||
            pin.longitude !== storedLongitude;
          const saved = await save({
            latitude: String(pin.latitude),
            longitude: String(pin.longitude),
            locationConfirmed: "true",
            ...(coordinatesChanged
              ? {
                  locationSource: "MANUAL_PIN",
                  geocodingProvider: "",
                  geocodingPlaceId: "",
                  streetViewHeading: "",
                  streetViewPitch: "",
                  streetViewPanoId: "",
                }
              : {}),
            currentStepId: "streetView",
            currentRoute: nextRoute,
          });
          if (saved) window.location.assign(nextHref);
        }}
        phaseOneProgress={72}
      />
    </>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Check, Loader2, LocateFixed, Lock, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { beginSave, endSave } from "@/components/host/v2/editor/save-state";
import { LocationPrivacyNote } from "@/components/host/v2/editor/location/location-privacy-note";
import { LocationSearch } from "@/components/host/v2/editor/location/location-search";
import {
  LocationLookupError,
  resolvePlace,
  reverseGeocodePoint,
  type PlacePrediction,
} from "@/components/host/v2/editor/location/location-lookup";
import {
  StreetViewPicker,
  type StreetViewSelection,
} from "@/components/host/street-view-picker";
import { updateListingLocation } from "@/lib/actions/listing-location.actions";
import {
  AREA_MAX,
  ADDRESS_MAX,
  CITY_MAX,
  COUNTRY_MAX,
  POSTAL_CODE_MAX,
  STREET_VIEW_TOLERANCE_M,
  listingLocationIssues,
  mergeGeocodedAddress,
  metresBetween,
  normalizeListingAddress,
  validCoordinates,
  type ListingAddressInput,
  type ListingLocationIssues,
  type ListingLocationPin,
  type ListingStreetView,
  type LocationIssue,
  type StoredListingLocation,
} from "@/lib/host/v2/listing-location";
import { EXACT_LOCATION_UNLOCK_DAYS } from "@/lib/utils/street-view-access";
import { Tx, useI18n } from "@/lib/i18n/client";

const LocationMap = dynamic(
  () => import("@/components/host/listing-location-picker-inner"),
  {
    ssr: false,
    loading: () => (
      <div className="size-full animate-pulse bg-slate-100" aria-hidden />
    ),
  },
);

type AddressField = keyof ListingAddressInput;

function addressOf(stored: StoredListingLocation): ListingAddressInput {
  return {
    address: stored.address,
    city: stored.city,
    area: stored.area,
    postalCode: stored.postalCode,
    country: stored.country,
  };
}

function streetViewOf(stored: StoredListingLocation): ListingStreetView | null {
  return stored.streetViewPanoId &&
    stored.streetViewHeading !== null &&
    stored.streetViewPitch !== null
    ? {
        panoId: stored.streetViewPanoId,
        heading: stored.streetViewHeading,
        pitch: stored.streetViewPitch,
      }
    : null;
}

function sameAddress(a: ListingAddressInput, b: ListingAddressInput): boolean {
  const left = normalizeListingAddress(a);
  const right = normalizeListingAddress(b);
  return (
    left.address === right.address &&
    left.city === right.city &&
    left.area === right.area &&
    left.postalCode === right.postalCode &&
    left.country === right.country
  );
}

function sameStreetView(
  a: ListingStreetView | null,
  b: ListingStreetView | null,
): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.panoId === b.panoId && a.heading === b.heading && a.pitch === b.pitch
  );
}

/**
 * The Location workspace.
 *
 * An explicit save, unlike the other editor sections. Picking a search result rewrites
 * five address fields and moves the pin in one go, and the pin is the one value a host
 * cannot check by rereading it — they have to look at the map. So the whole screen is a
 * draft until they press Save, and the header's indicator only lights up for the write
 * they asked for.
 *
 * The stored coordinates are never resent. `pin` starts null and only becomes something
 * once the host actually places one in this session, which is what stops a save that
 * corrects a house number from re-geocoding a property that was already exactly right.
 */
export function LocationWorkspace({
  listingId,
  stored: initialStored,
}: {
  listingId: string;
  stored: StoredListingLocation;
}) {
  const { resolve } = useI18n();

  /** What the server is known to hold. Replaced only by a save it confirmed. */
  const [stored, setStored] = useState(initialStored);
  const [address, setAddress] = useState<ListingAddressInput>(() =>
    addressOf(initialStored),
  );
  /** A pin placed in this session. Null means "the stored coordinates still stand". */
  const [pin, setPin] = useState<ListingLocationPin | null>(null);
  const [streetView, setStreetView] = useState<ListingStreetView | null>(() =>
    streetViewOf(initialStored),
  );
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<AddressField, boolean>>>(
    {},
  );
  /** Set by a refused save, so every offending field shows its reason at once rather
   *  than one per attempt. */
  const [showAllIssues, setShowAllIssues] = useState(false);
  /**
   * Whether the host has actually handled the panorama yet.
   *
   * The picker reports its camera angle the moment it loads, and on a listing with no
   * saved view that angle is Google's arbitrary default. Committing it would put the
   * form into "unsaved changes" before the host touched anything, and would eventually
   * store a direction nobody chose. So the first reports are ignored until a pointer or
   * a key lands on the panorama; from then on every turn of the camera counts.
   */
  const streetViewTouched = useRef(false);
  const reverseRequest = useRef(0);
  const mounted = useRef(true);
  const navigationApproved = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const latitude = pin ? pin.latitude : stored.latitude;
  const longitude = pin ? pin.longitude : stored.longitude;
  const hasPin = validCoordinates(latitude, longitude);

  const issues = useMemo(
    () => listingLocationIssues({ ...address, pin, streetView }, stored),
    [address, pin, streetView, stored],
  );

  const dirty =
    !sameAddress(address, addressOf(stored)) ||
    pin !== null ||
    !sameStreetView(streetView, streetViewOf(stored));

  /** Applies a resolved place: the pin goes exactly where the host aimed, and only the
   *  address lines the provider actually filled in are taken. */
  const applyResolved = useCallback(
    (
      resolved: Partial<ListingAddressInput>,
      next: ListingLocationPin | null,
    ) => {
      setAddress((current) => mergeGeocodedAddress(current, resolved));
      if (!next) return;
      setPin(next);
      // The panorama remounts at the new coordinates, so its first report is once again
      // a default nobody chose.
      streetViewTouched.current = false;
      // A panorama is a photo of one building. Once the pin leaves it, the angle the
      // host confirmed no longer describes the property — the server enforces the same
      // rule, this just keeps the screen from claiming otherwise in the meantime.
      setStreetView((current) => {
        if (!current) return current;
        if (!validCoordinates(stored.latitude, stored.longitude)) return null;
        const from = {
          latitude: stored.latitude as number,
          longitude: stored.longitude as number,
        };
        return metresBetween(from, next) > STREET_VIEW_TOLERANCE_M
          ? null
          : current;
      });
    },
    [stored.latitude, stored.longitude],
  );

  const handleSelectPrediction = useCallback(
    (prediction: PlacePrediction, sessionToken: string) => {
      setResolving(true);
      resolvePlace({ placeId: prediction.placeId, sessionToken })
        .then((result) => {
          if (!mounted.current) return;
          if (!result) {
            toast.error(
              resolve(
                "host.editor.location.place_missing",
                "We couldn't look that place up. Try another result, or place the pin yourself.",
              ).text,
            );
            return;
          }
          applyResolved(result, {
            latitude: result.latitude,
            longitude: result.longitude,
            source: "AUTOCOMPLETE",
            provider: "GOOGLE_PLACES",
            placeId: result.placeId,
          });
        })
        .catch((cause) => {
          if (!mounted.current) return;
          toast.error(
            cause instanceof LocationLookupError && cause.message
              ? cause.message
              : resolve(
                  "host.editor.location.place_failed",
                  "We couldn't look that place up. Try again, or place the pin yourself.",
                ).text,
          );
        })
        .finally(() => {
          if (mounted.current) setResolving(false);
        });
    },
    [applyResolved, resolve],
  );

  /** The host aimed the map at a point. The pin is committed immediately; the address
   *  text follows if a geocoder can name it, and the pin stands either way. */
  const handleMapMove = useCallback(
    (nextLat: number, nextLng: number) => {
      if (!validCoordinates(nextLat, nextLng)) return;
      const request = ++reverseRequest.current;
      const placed: ListingLocationPin = {
        latitude: nextLat,
        longitude: nextLng,
        source: "MANUAL_PIN",
        provider: "",
        placeId: "",
      };
      applyResolved({}, placed);

      setResolving(true);
      reverseGeocodePoint({ latitude: nextLat, longitude: nextLng })
        .then((result) => {
          if (!mounted.current || request !== reverseRequest.current) return;
          if (!result) return;
          // Reverse geocoding answers with the nearest known address's own
          // coordinates, rarely the exact spot aimed at. Take the words, keep the pin.
          setAddress((current) => mergeGeocodedAddress(current, result));
          setPin((current) =>
            current && current.latitude === nextLat && current.longitude === nextLng
              ? {
                  ...current,
                  provider: "GEOAPIFY",
                  placeId: result.placeId ?? "",
                }
              : current,
          );
        })
        .catch(() => {
          // The pin the host placed is still valid with no address behind it. They can
          // type the street line themselves, which the empty-address hint asks for.
        })
        .finally(() => {
          if (mounted.current && request === reverseRequest.current) {
            setResolving(false);
          }
        });
    },
    [applyResolved],
  );

  const handleUseCurrentLocation = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext || !navigator.geolocation) {
      toast.error(
        resolve(
          "host.editor.location.geolocation_unavailable",
          "Your browser can't share a location here. Search for the address instead.",
        ).text,
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = position.coords;
        if (!validCoordinates(lat, lng)) {
          toast.error(
            resolve(
              "host.editor.location.geolocation_invalid",
              "Your browser returned a location we can't use. Search for the address instead.",
            ).text,
          );
          return;
        }
        handleMapMove(lat, lng);
        toast.success(
          resolve(
            "host.editor.location.geolocation_added",
            "Pin moved to where you are. Drag the map if the property is nearby rather than exactly here.",
          ).text,
        );
      },
      () => {
        setLocating(false);
        toast.error(
          resolve(
            "host.editor.location.geolocation_denied",
            "Location access wasn't allowed. Search for the address or place the pin yourself.",
          ).text,
        );
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, [handleMapMove, resolve]);

  const handleStreetView = useCallback((selection: StreetViewSelection) => {
    if (!streetViewTouched.current) return;
    setStreetView({
      heading: selection.heading,
      pitch: selection.pitch,
      panoId: selection.panoId,
    });
  }, []);

  async function handleSave() {
    if (saving || !dirty) return;
    if (Object.keys(issues).length > 0) {
      setShowAllIssues(true);
      return;
    }

    setSaving(true);
    beginSave();
    try {
      const result = await updateListingLocation(listingId, {
        ...address,
        pin,
        streetView,
      });
      if (result.error) {
        endSave(true);
        if (mounted.current) toast.error(result.error);
        return;
      }
      if (result.issues && Object.keys(result.issues).length > 0) {
        endSave(true);
        if (mounted.current) setShowAllIssues(true);
        return;
      }
      endSave();
      if (!mounted.current || !result.stored) return;
      // Settle on the server's answer rather than assuming the optimistic state was
      // accepted — it may have dropped a Street View angle the pin moved away from.
      setStored(result.stored);
      setAddress(addressOf(result.stored));
      setStreetView(streetViewOf(result.stored));
      setPin(null);
      setShowAllIssues(false);
      toast.success(
        resolve("host.editor.location.saved", "Location saved").text,
      );
    } catch {
      endSave(true);
      if (mounted.current) {
        toast.error(
          resolve(
            "host.editor.location.save_failed",
            "We couldn't save that. Check your connection — nothing you typed is lost.",
          ).text,
        );
      }
    } finally {
      if (mounted.current) setSaving(false);
    }
  }

  function handleDiscard() {
    reverseRequest.current += 1;
    setAddress(addressOf(stored));
    setPin(null);
    setStreetView(streetViewOf(stored));
    setTouched({});
    setShowAllIssues(false);
    setResolving(false);
  }

  // Leaving mid-edit loses the draft, because nothing here is written until Save.
  // `beforeunload` covers a tab close or full-page navigation; Next links are client-side
  // transitions and never unload the document, so their clicks need the same guard.
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      if (navigationApproved.current) return;
      event.preventDefault();
    }
    function confirmLink(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      const destination = new URL(anchor.href, window.location.href);
      if (destination.href === window.location.href) return;
      const leave = window.confirm(
        resolve(
          "host.editor.location.leave_unsaved",
          "Leave without saving your location changes?",
        ).text,
      );
      if (!leave) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      navigationApproved.current = true;
    }
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", confirmLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", confirmLink, true);
    };
  }, [dirty, resolve]);

  function fieldIssue(field: AddressField): LocationIssue | undefined {
    if (!showAllIssues && !touched[field]) return undefined;
    return (issues as ListingLocationIssues)[
      field as keyof ListingLocationIssues
    ];
  }

  return (
    // Two columns where the width allows it: the map and the address are one question
    // asked twice, and putting them side by side means a host correcting a street number
    // can see the pin move under it. Street View spans the full width underneath — it is
    // a place you walk around in, not a thumbnail.
    <div className="mx-auto w-full max-w-[1140px] pb-28 pt-4 md:pt-6">
      <header className="sr-only">
        <h1>
          <Tx k="host.editor.location.heading" source="Location" />
        </h1>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:gap-8">
        {/* Where it is. */}
        <section className="min-w-0" aria-labelledby="location-map-heading">
          <h2 id="location-map-heading" className="sr-only">
            <Tx k="host.editor.location.map_heading" source="Map" />
          </h2>

          <LocationSearch
            bias={
              hasPin
                ? { latitude: latitude as number, longitude: longitude as number }
                : undefined
            }
            onSelect={handleSelectPrediction}
            busy={resolving}
          />

          <div className="relative mt-3 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-900/5">
            <div className="relative h-[300px] w-full sm:h-[360px]">
              {hasPin ? (
                <LocationMap
                  lat={latitude as number}
                  lng={longitude as number}
                  hasPin
                  zoom={17}
                  interactive
                  // The map sits inside a scrolling form. "cooperative" hands the wheel
                  // back to the page and asks for ⌘/Ctrl — or two fingers on a trackpad
                  // — before it zooms, so scrolling past no longer drags the pin's zoom
                  // down to a rooftop the host never chose to look at.
                  gestureHandling="cooperative"
                  className="size-full"
                  onChange={handleMapMove}
                />
              ) : (
                /* No coordinates at all: an empty world map with a pin floating over
                   the Atlantic would look like a placed location. Say so instead. */
                <div className="flex size-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <MapPin className="size-5 text-slate-400" aria-hidden />
                  <p className="text-sm text-slate-600">
                    <Tx
                      k="host.editor.location.no_pin"
                      source="Search above to drop the pin."
                    />
                  </p>
                </div>
              )}
            </div>

            {hasPin && (
              // Top right, not bottom right: Google renders its own zoom buttons in the
              // bottom-right corner and this was landing on top of them.
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                disabled={locating}
                title={
                  resolve(
                    "host.editor.location.use_current",
                    "Use my current location",
                  ).text
                }
                aria-label={
                  resolve(
                    "host.editor.location.use_current",
                    "Use my current location",
                  ).text
                }
                className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {locating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <LocateFixed className="size-4" aria-hidden />
                )}
              </button>
            )}
          </div>

          <LocationPrivacyNote
            resolve={resolve}
            area={address.area}
            city={address.city}
            country={address.country}
            className="mt-2.5"
          />

          {issues.pin && (showAllIssues || pin !== null) && (
            <p role="alert" className="mt-2 text-sm text-rose-600">
              <Tx
                k="host.editor.location.error_no_pin"
                source="Place the pin before saving."
              />
            </p>
          )}
        </section>

        {/* What it is called. */}
        <section className="min-w-0" aria-labelledby="location-address-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="location-address-heading"
              className="text-sm font-medium text-slate-900"
            >
              <Tx k="host.editor.location.address_heading" source="Address" />
            </h2>
            {/* Announced rather than laid out, so the heading row keeps its height
                whether or not a lookup is running. */}
            <p
              role="status"
              aria-live="polite"
              className="text-[13px] leading-5 text-slate-400 empty:hidden"
            >
              {resolving
                ? resolve("host.editor.location.resolving", "Updating…").text
                : ""}
            </p>
          </div>

          <div className="mt-3 space-y-3.5" aria-busy={resolving}>
            <AddressField
              field="address"
              label={
                resolve("host.editor.location.address_label", "Street address").text
              }
              value={address.address}
              max={ADDRESS_MAX}
              issue={fieldIssue("address")}
              disabled={resolving}
              onChange={(next) =>
                setAddress((current) => ({ ...current, address: next }))
              }
              onBlur={() => setTouched((t) => ({ ...t, address: true }))}
            />

            <div className="grid gap-3.5 sm:grid-cols-2">
              <AddressField
                field="city"
                label={resolve("host.editor.location.city_label", "City").text}
                value={address.city}
                max={CITY_MAX}
                issue={fieldIssue("city")}
                disabled={resolving}
                publicField
                onChange={(next) =>
                  setAddress((current) => ({ ...current, city: next }))
                }
                onBlur={() => setTouched((t) => ({ ...t, city: true }))}
              />
              <AddressField
                field="postalCode"
                label={
                  resolve("host.editor.location.postal_label", "Postal code").text
                }
                value={address.postalCode}
                max={POSTAL_CODE_MAX}
                issue={fieldIssue("postalCode")}
                disabled={resolving}
                onChange={(next) =>
                  setAddress((current) => ({ ...current, postalCode: next }))
                }
                onBlur={() => setTouched((t) => ({ ...t, postalCode: true }))}
              />
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <AddressField
                field="area"
                label={resolve("host.editor.location.area_label", "Area").text}
                value={address.area}
                max={AREA_MAX}
                issue={fieldIssue("area")}
                disabled={resolving}
                publicField
                onChange={(next) =>
                  setAddress((current) => ({ ...current, area: next }))
                }
                onBlur={() => setTouched((t) => ({ ...t, area: true }))}
              />
              <AddressField
                field="country"
                label={
                  resolve("host.editor.location.country_label", "Country").text
                }
                value={address.country}
                max={COUNTRY_MAX}
                issue={fieldIssue("country")}
                disabled={resolving}
                publicField
                onChange={(next) =>
                  setAddress((current) => ({ ...current, country: next }))
                }
                onBlur={() => setTouched((t) => ({ ...t, country: true }))}
              />
            </div>
          </div>
        </section>
      </div>

      {/* What it looks like on arrival. Same two-column rhythm as above: the panorama
          takes the wide side, and the column beside it says why it is worth setting. */}
      <section
        className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:gap-8"
        aria-labelledby="location-street-view-heading"
      >
        <div className="order-2 min-w-0 lg:order-1">
          {hasPin ? (
            <div
              // Any pointer or key landing here is the host taking over the camera.
              // Until one does, the angle the panorama reports is Google's default and
              // is deliberately ignored — see `streetViewTouched`.
              onPointerDownCapture={() => {
                streetViewTouched.current = true;
              }}
              onKeyDownCapture={() => {
                streetViewTouched.current = true;
              }}
              className="h-[320px] overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-900/5 sm:h-[400px]"
            >
              <StreetViewPicker
                key={`${(latitude as number).toFixed(5)},${(longitude as number).toFixed(5)}`}
                latitude={latitude as number}
                longitude={longitude as number}
                initialSelection={streetView}
                onUseView={handleStreetView}
                gestureHandling="cooperative"
                fill
              />
            </div>
          ) : (
            <div className="flex h-[220px] items-center justify-center rounded-2xl bg-slate-50 px-6 text-center text-sm text-slate-500">
              <Tx
                k="host.editor.location.street_view_no_pin"
                source="Place the pin first, and the street will appear here."
              />
            </div>
          )}
        </div>

        <div className="order-1 min-w-0 lg:order-2">
          <div className="flex items-center gap-2">
            <h2
              id="location-street-view-heading"
              className="text-sm font-medium text-slate-900"
            >
              <Tx k="host.editor.location.street_view_heading" source="Street View" />
            </h2>
            {streetView && (
              <span className="inline-flex items-center gap-1 text-[13px] text-emerald-700">
                <Check className="size-3.5" aria-hidden />
                <Tx k="host.editor.location.street_view_set" source="Saved" />
              </span>
            )}
          </div>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            <Tx
              k="host.editor.location.street_view_purpose"
              source="Point the camera at what a guest sees walking up. It is the difference between finding your door and circling the block with a suitcase."
            />
          </p>

          <p className="mt-3 flex items-start gap-2 text-[13px] leading-5 text-slate-500">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              {
                resolve(
                  "host.editor.location.street_view_privacy",
                  "Never public. A guest sees it with their arrival instructions {days} days before check-in, once you have confirmed their booking.",
                ).text.replace("{days}", String(EXACT_LOCATION_UNLOCK_DAYS))
              }
            </span>
          </p>

          {hasPin && (
            <ul className="mt-4 space-y-1.5 text-[13px] leading-5 text-slate-500">
              <li>
                <Tx
                  k="host.editor.location.street_view_tip_drag"
                  source="Drag to turn the camera."
                />
              </li>
              <li>
                <Tx
                  k="host.editor.location.street_view_tip_zoom"
                  source="Hold ⌘/Ctrl and scroll to zoom."
                />
              </li>
              <li>
                <Tx
                  k="host.editor.location.street_view_tip_move"
                  source="Use the arrows on the street, or the arrow keys, to move along it."
                />
              </li>
            </ul>
          )}
        </div>
      </section>

      {/* The save bar appears only when there is something to save. A permanent bar
          with a dead button is a permanent piece of clutter. */}
      {dirty && (
        <div className="sticky bottom-0 z-10 mt-8 -mx-4 border-t border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5">
          <div className="flex items-center justify-end gap-2">
            <p className="mr-auto text-[13px] text-slate-500">
              {resolve("host.editor.location.unsaved", "Unsaved changes").text}
            </p>
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-full px-4 text-slate-700 hover:bg-slate-100"
              onClick={handleDiscard}
              disabled={saving}
            >
              <Tx k="host.editor.location.discard" source="Discard" />
            </Button>
            <Button
              type="button"
              className="h-10 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-800"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
              <Tx k="host.editor.location.save" source="Save" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One address line.
 *
 * No help text under any of them. The labels say what the boxes are, the map beside
 * them fills them in, and a paragraph explaining that a street address contains a street
 * number is the kind of thing that makes a short form feel long. The only mark left is
 * a quiet "Public" on the three lines that appear on the listing page.
 */
function AddressField({
  field,
  label,
  value,
  max,
  issue,
  disabled,
  publicField = false,
  onChange,
  onBlur,
}: {
  field: AddressField;
  label: string;
  value: string;
  max: number;
  issue: LocationIssue | undefined;
  disabled: boolean;
  /** Printed on the public listing page. */
  publicField?: boolean;
  onChange: (next: string) => void;
  onBlur: () => void;
}) {
  const { resolve } = useI18n();
  const id = `location-${field}`;
  const errorId = `${id}-error`;
  const message = issue ? issueMessage(resolve, issue, max) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-slate-700">
          {label}
        </label>
        {publicField && (
          <span className="text-[11px] text-slate-400">
            {resolve("host.editor.location.shown_publicly", "Public").text}
          </span>
        )}
      </div>
      <Input
        id={id}
        // Place names the host typed — the page translator must not rewrite them into
        // the reader's language and have the next save store that.
        className="notranslate mt-1.5 h-11 rounded-xl border-slate-200 bg-white shadow-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-60 md:h-10"
        translate="no"
        value={value}
        maxLength={max}
        disabled={disabled}
        aria-invalid={Boolean(issue)}
        aria-describedby={issue ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <p
        id={errorId}
        role="alert"
        className="mt-1 text-[13px] text-rose-600 empty:hidden"
      >
        {message}
      </p>
    </div>
  );
}

function issueMessage(
  resolve: (key: string, source: string) => { text: string },
  issue: LocationIssue,
  max: number,
): string {
  switch (issue) {
    case "EMPTY":
      return resolve("host.editor.location.error_empty", "Required.").text;
    case "TOO_SHORT":
      return resolve(
        "host.editor.location.error_too_short",
        "That looks too short.",
      ).text;
    case "TOO_LONG":
      return resolve(
        "host.editor.location.error_too_long",
        "At most {max} characters.",
      ).text.replace("{max}", String(max));
    case "NO_PIN":
      return resolve(
        "host.editor.location.error_no_pin",
        "Place the pin before saving.",
      ).text;
  }
}

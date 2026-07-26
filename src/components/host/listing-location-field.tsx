"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Link2,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { resolveMapsLink } from "@/lib/actions/listing.actions";
import { parseCoordsFromMapsText } from "@/lib/utils/parse-maps-link";
import { StreetViewPreview } from "@/components/host/street-view-preview";

const ListingLocationPickerInner = dynamic(
  () => import("./listing-location-picker-inner"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[280px] w-full animate-pulse rounded-lg bg-muted" />
    ),
  }
);

const WORLD_CENTER: [number, number] = [20, 0];

export type ListingLocationValue = {
  address: string;
  city: string;
  area: string;
  postalCode: string;
  country: string;
  latitude: string;
  longitude: string;
  locationSource: string;
  locationConfirmed: string;
  geocodingProvider: string;
  geocodingPlaceId: string;
  geocodingConfidence: string;
};

type LocationSuggestion = {
  id: string;
  label: string;
  address: string;
  city: string;
  area: string;
  postalCode: string;
  country: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  placeId: string;
  confidence?: number;
};

type IpLocation = {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  countryCode: string;
};

function finiteCoordinate(value: string, min: number, max: number) {
  // `Number("")` is 0, not NaN — without this guard an unset coordinate reads as a
  // real pin at exactly (0, 0), which is what put new listings' starting pin in the
  // ocean off West Africa instead of showing no pin at all.
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

function preferredLanguage() {
  if (typeof document === "undefined") return "en";
  const language = document.documentElement.lang || navigator.language || "en";
  return language.slice(0, 2).toLowerCase();
}

/** Deep-links straight into a Google Maps search, prefilled with whatever city/country
 *  is already known — saves the host from re-typing something we already have, and
 *  gives Maps a head start over its much better address data for places (rural Greece
 *  included) that Geoapify's search struggles with. */
function googleMapsSearchUrl(city: string, country: string): string {
  const query = [city, country].filter(Boolean).join(", ");
  if (!query) return "https://www.google.com/maps";
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query }).toString()}`;
}

export function ListingLocationField({
  value,
  onChange,
  active = true,
}: {
  value: ListingLocationValue;
  onChange: (patch: Partial<ListingLocationValue>) => void;
  /** Whether this field is the step the host is currently looking at. The listing
   *  wizard keeps every step's fields mounted at once (just hidden via CSS) so it can
   *  validate and preview across steps — without this, the geolocation prompt below
   *  would fire the moment the wizard first loads (step 1), not when the host actually
   *  reaches the location step, which is both surprising and something some browsers
   *  quietly refuse to prompt for outside a real user action. */
  active?: boolean;
}) {
  const initialLat = finiteCoordinate(value.latitude, -90, 90);
  const initialLng = finiteCoordinate(value.longitude, -180, 180);
  const hasPin = initialLat !== null && initialLng !== null;
  const [mapCenter, setMapCenter] = React.useState<[number, number]>(
    hasPin ? [initialLat, initialLng] : WORLD_CENTER
  );
  // Only meaningful while there's no pin — starts at the whole-world view and tightens
  // once a location signal (device GPS, then IP as a fallback) narrows it down. Once a
  // pin exists the map always zooms to street level instead.
  const [mapZoom, setMapZoom] = React.useState(2);
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<LocationSuggestion[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [activeSuggestion, setActiveSuggestion] = React.useState(-1);
  const [linkValue, setLinkValue] = React.useState("");
  const [resolving, setResolving] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = React.useState(false);
  const [locationMessage, setLocationMessage] = React.useState("");
  const abortRef = React.useRef<AbortController | null>(null);
  const searchRequestRef = React.useRef(0);
  const reverseRequestRef = React.useRef(0);
  const selectedQueryRef = React.useRef("");

  React.useEffect(() => {
    if (hasPin || !active) return;

    let cancelled = false;
    const controller = new AbortController();

    // Coarse (city-level) fallback for when the browser can't or won't give an exact
    // position — still far better than the whole-world view. This is only ever used
    // to recenter the map, never to place a pin: a host still has to search, click, or
    // explicitly confirm "I'm at the property" before any coordinate is saved.
    function centerFromIp() {
      void fetch("/api/location/ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return null;
          return (await response.json()) as { result?: IpLocation | null };
        })
        .then((payload) => {
          if (cancelled || !payload?.result) return;
          setMapCenter([payload.result.latitude, payload.result.longitude]);
          setMapZoom(11);
        })
        .catch(() => {
          // IP location is only a convenience; the world view remains usable.
        });
    }

    // Ask for device location as soon as this step is reached, without an extra click
    // or confirmation dialog first — this only moves the *starting view*, it does not
    // place or confirm a pin, so it doesn't need the same "are you at the property"
    // gate the explicit "Use my current location" button has.
    if (window.isSecureContext && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          const latitude = Number(position.coords.latitude);
          const longitude = Number(position.coords.longitude);
          if (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            latitude >= -90 &&
            latitude <= 90 &&
            longitude >= -180 &&
            longitude <= 180
          ) {
            setMapCenter([latitude, longitude]);
            setMapZoom(13);
          } else {
            centerFromIp();
          }
        },
        () => {
          // Permission denied, unavailable, or timed out — fall back to IP.
          if (!cancelled) centerFromIp();
        },
        { enableHighAccuracy: false, timeout: 6_000, maximumAge: 5 * 60_000 }
      );
    } else {
      centerFromIp();
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [hasPin, active]);

  React.useEffect(() => {
    const normalized = query.trim();
    abortRef.current?.abort();

    if (
      normalized.length < 3 ||
      normalized === selectedQueryRef.current
    ) {
      return;
    }

    const request = ++searchRequestRef.current;
    const timeout = window.setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      setSearchError("");

      void fetch("/api/location/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: normalized,
          language: preferredLanguage(),
          bias: {
            latitude: mapCenter[0],
            longitude: mapCenter[1],
          },
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            results?: LocationSuggestion[];
            error?: string;
          };
          if (!response.ok) throw new Error(payload.error || "Address search failed");
          return payload.results ?? [];
        })
        .then((results) => {
          if (request === searchRequestRef.current) setSuggestions(results);
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") return;
          if (request === searchRequestRef.current) {
            setSuggestions([]);
            setSearchError(
              error instanceof Error
                ? error.message
                : "Address search is unavailable"
            );
          }
        })
        .finally(() => {
          if (request === searchRequestRef.current) setSearching(false);
        });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [mapCenter, query]);

  function applyGeocodedLocation(
    result: LocationSuggestion,
    source: "AUTOCOMPLETE" | "MANUAL_PIN" | "BROWSER_LOCATION" | "MAPS_LINK"
  ) {
    setMapCenter([result.latitude, result.longitude]);
    // Send the new result's fields as-is, including empty ones — falling back to the
    // old value here (as this used to) meant moving the pin somewhere new could leave
    // stale text from a *previous* pin (e.g. an old test location's "area") sitting
    // next to a brand new city/country. The parent decides whether to actually apply
    // each field, skipping any the host has manually typed over — see updateLocation
    // in listing-form.tsx.
    onChange({
      address: result.address,
      city: result.city,
      area: result.area,
      postalCode: result.postalCode,
      country: result.country,
      latitude: String(result.latitude),
      longitude: String(result.longitude),
      locationSource: source,
      locationConfirmed: "true",
      geocodingProvider: "GEOAPIFY",
      geocodingPlaceId: result.placeId,
      geocodingConfidence:
        typeof result.confidence === "number"
          ? String(result.confidence)
          : "",
    });
  }

  /**
   * Fills in address text (street/city/area/postcode/country) from a reverse-geocode
   * lookup, but keeps the pin at the exact coordinates the host chose. Reverse geocoding
   * returns the nearest known address's own coordinates, which are rarely the exact
   * spot clicked — using those for the pin instead of just the address text is what
   * made the pin visibly jump after every click or drag.
   *
   * Sends the new result's fields as-is (see applyGeocodedLocation for why not falling
   * back to the old value) — the parent skips applying any field the host has manually
   * typed over.
   */
  function applyReverseGeocodedAddress(
    result: LocationSuggestion,
    source: "MANUAL_PIN" | "BROWSER_LOCATION" | "MAPS_LINK",
    latitude: number,
    longitude: number
  ) {
    onChange({
      address: result.address,
      city: result.city,
      area: result.area,
      postalCode: result.postalCode,
      country: result.country,
      latitude: String(latitude),
      longitude: String(longitude),
      locationSource: source,
      locationConfirmed: "true",
      geocodingProvider: "GEOAPIFY",
      geocodingPlaceId: result.placeId,
      geocodingConfidence:
        typeof result.confidence === "number"
          ? String(result.confidence)
          : "",
    });
  }

  function chooseSuggestion(result: LocationSuggestion) {
    abortRef.current?.abort();
    selectedQueryRef.current = result.label;
    setQuery(result.label);
    setSuggestions([]);
    setSearchError("");
    applyGeocodedLocation(result, "AUTOCOMPLETE");
  }

  async function setCoordinates(
    latitude: number,
    longitude: number,
    source: "MANUAL_PIN" | "BROWSER_LOCATION" | "MAPS_LINK"
  ) {
    const request = ++reverseRequestRef.current;
    setMapCenter([latitude, longitude]);
    onChange({
      latitude: String(latitude),
      longitude: String(longitude),
      locationSource: source,
      locationConfirmed: "true",
      geocodingProvider: "",
      geocodingPlaceId: "",
      geocodingConfidence: "",
    });

    setResolving(true);
    try {
      const response = await fetch("/api/location/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude,
          longitude,
          language: preferredLanguage(),
        }),
      });
      const payload = (await response.json()) as {
        result?: LocationSuggestion | null;
      };
      if (
        request === reverseRequestRef.current &&
        response.ok &&
        payload.result
      ) {
        applyReverseGeocodedAddress(payload.result, source, latitude, longitude);
      }
    } catch {
      // The exact pin remains valid even when no address can be resolved.
    } finally {
      if (request === reverseRequestRef.current) setResolving(false);
    }
  }

  function requestCurrentLocation() {
    setLocationDialogOpen(false);
    setLocationMessage("");

    if (!window.isSecureContext) {
      const message =
        "Current location is only available on a secure HTTPS connection.";
      setLocationMessage(message);
      toast.error(message);
      return;
    }
    if (!navigator.geolocation) {
      const message = "Current location is not available in this browser.";
      setLocationMessage(message);
      toast.error(message);
      return;
    }

    setLocating(true);
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latitude = Number(position.coords.latitude);
          const longitude = Number(position.coords.longitude);
          if (
            !Number.isFinite(latitude) ||
            latitude < -90 ||
            latitude > 90 ||
            !Number.isFinite(longitude) ||
            longitude < -180 ||
            longitude > 180
          ) {
            setLocating(false);
            const message =
              "Your browser returned an invalid location. Search for the address or place the pin manually.";
            setLocationMessage(message);
            toast.error(message);
            return;
          }

          void setCoordinates(
            latitude,
            longitude,
            "BROWSER_LOCATION"
          )
            .then(() => {
              setLocationMessage(
                "Current location added. Check the pin and drag it if the property is nearby rather than exactly here."
              );
              toast.success("Current location added");
            })
            .catch(() => {
              const message =
                "We couldn't add your current location. Search for the address or place the pin manually.";
              setLocationMessage(message);
              toast.error(message);
            })
            .finally(() => setLocating(false));
        },
        (error) => {
          setLocating(false);
          const message =
            error.code === error.PERMISSION_DENIED
              ? "Location access was not allowed. You can search for the property or place the pin on the map."
              : error.code === error.TIMEOUT
                ? "Finding your location took too long. Try again, search for the address, or place the pin manually."
                : "We couldn't determine your current location. Search for the address or place the pin manually.";
          setLocationMessage(message);
          toast.error(message);
        },
        {
          enableHighAccuracy: false,
          timeout: 15_000,
          maximumAge: 60_000,
        }
      );
    } catch {
      setLocating(false);
      const message =
        "Your browser blocked the location request. Search for the address or place the pin manually.";
      setLocationMessage(message);
      toast.error(message);
    }
  }

  async function applyLink() {
    const text = linkValue.trim();
    if (!text) return;

    const direct = parseCoordsFromMapsText(text);
    if (direct) {
      await setCoordinates(direct.lat, direct.lng, "MAPS_LINK");
      toast.success("Pin updated from link");
      return;
    }

    setResolving(true);
    try {
      const result = await resolveMapsLink(text);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      await setCoordinates(result.lat, result.lng, "MAPS_LINK");
      toast.success("Pin updated from link");
    } finally {
      setResolving(false);
    }
  }

  const latitude = initialLat ?? mapCenter[0];
  const longitude = initialLng ?? mapCenter[1];
  const confirmed = hasPin && value.locationConfirmed === "true";
  const stale = hasPin && !confirmed;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="maps-link" className="text-sm font-semibold">
            Property location
          </Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label="How to get a Google Maps link"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              Open Google Maps, find the property, tap Share → Copy link
              (desktop: right-click the spot on the map → Copy link), then
              paste it here.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex gap-2">
          <Input
            id="maps-link"
            placeholder="Paste a Google Maps link"
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void applyLink();
              }
            }}
          />
          <Button
            type="button"
            onClick={() => void applyLink()}
            disabled={resolving || !linkValue.trim()}
          >
            {resolving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
            Use link
          </Button>
        </div>
        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
          <a
            href={googleMapsSearchUrl(value.city, value.country)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-3 w-3" />
            Open Google Maps
          </a>
        </Button>
      </div>

      <details className="group rounded-lg border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          Prefer to search or use your current location instead?
        </summary>
        <div className="mt-3 space-y-2">
          <Label htmlFor="address-search" className="text-xs">
            Search for the property address
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="address-search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={suggestions.length > 0}
              aria-controls="address-search-results"
              aria-activedescendant={
                activeSuggestion >= 0
                  ? `address-result-${activeSuggestion}`
                  : undefined
              }
              autoComplete="off"
              className="pl-9 pr-9"
              placeholder="Start typing an address, city, or place"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                selectedQueryRef.current = "";
                setQuery(nextQuery);
                setActiveSuggestion(-1);
                if (nextQuery.trim().length < 3) {
                  setSuggestions([]);
                  setSearching(false);
                  setSearchError("");
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && suggestions.length > 0) {
                  event.preventDefault();
                  setActiveSuggestion((current) =>
                    Math.min(suggestions.length - 1, current + 1)
                  );
                } else if (event.key === "ArrowUp" && suggestions.length > 0) {
                  event.preventDefault();
                  setActiveSuggestion((current) => Math.max(0, current - 1));
                } else if (event.key === "Enter" && activeSuggestion >= 0) {
                  event.preventDefault();
                  chooseSuggestion(suggestions[activeSuggestion]);
                } else if (event.key === "Escape") {
                  setSuggestions([]);
                  setActiveSuggestion(-1);
                }
              }}
              onBlur={() => {
                window.setTimeout(() => setSuggestions([]), 150);
              }}
            />
            {searching && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {suggestions.length > 0 && (
              <div
                id="address-search-results"
                role="listbox"
                className="absolute z-[1000] mt-1 max-h-64 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
              >
                {suggestions.map((result, index) => (
                  <button
                    id={`address-result-${index}`}
                    key={result.id}
                    type="button"
                    role="option"
                    aria-selected={activeSuggestion === index}
                    className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm ${
                      activeSuggestion === index ? "bg-muted" : "hover:bg-muted"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseSuggestion(result)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{result.label}</span>
                  </button>
                ))}
                <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                  Powered by Geoapify
                </div>
              </div>
            )}
          </div>
          {searchError && (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {searchError}. You can still set the exact location on the map.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={locating || resolving}
              onClick={() => setLocationDialogOpen(true)}
            >
              {locating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              Use my current location
            </Button>
            <span className="text-xs text-muted-foreground">
              Only use this if you are at the property.
            </span>
          </div>
          {locationMessage && (
            <p
              className="flex items-start gap-1.5 text-xs text-muted-foreground"
              aria-live="polite"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {locationMessage}
            </p>
          )}
        </div>
      </details>

      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you at the property now?</DialogTitle>
            <DialogDescription>
              Choose yes only if you are physically at the property. Your
              browser will then ask whether book.easy.mk may use your current
              location. You can deny the request and continue by searching or
              selecting the property on the map.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocationDialogOpen(false)}
            >
              No, I&apos;ll choose it
            </Button>
            <Button type="button" onClick={requestCurrentLocation}>
              <LocateFixed className="h-4 w-4" />
              Yes, use where I am
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Confirm the exact location</Label>
          {confirmed ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Location confirmed
            </span>
          ) : stale ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5" />
              Confirm location again
            </span>
          ) : null}
        </div>
        <ListingLocationPickerInner
          lat={latitude}
          lng={longitude}
          hasPin={hasPin}
          zoom={mapZoom}
          onChange={(nextLat, nextLng) => {
            void setCoordinates(nextLat, nextLng, "MANUAL_PIN");
          }}
        />
        <p className="text-xs text-muted-foreground">
          Click the map to place a pin, or drag the pin to fine-tune it.
        </p>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {resolving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <MapPin className="h-3.5 w-3.5" />
        )}
        {hasPin ? (
          <span>
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </span>
        ) : (
          <span>
            The map starts near your approximate IP location. No property pin is
            saved until you choose one.
          </span>
        )}
      </div>

      {hasPin && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">
            Street view near this pin
          </Label>
          {/* Remounts on each new pin position so its "checking" state resets
             cleanly — see StreetViewPreview for why that's done via key instead of
             an effect-internal reset. Rounded so floating-point noise from repeated
             reverse-geocode round-trips doesn't remount it needlessly. */}
          <StreetViewPreview
            key={`${latitude.toFixed(5)},${longitude.toFixed(5)}`}
            latitude={latitude}
            longitude={longitude}
          />
        </div>
      )}

      <input type="hidden" name="latitude" value={value.latitude} />
      <input type="hidden" name="longitude" value={value.longitude} />
      <input
        type="hidden"
        name="locationSource"
        value={value.locationSource}
      />
      <input
        type="hidden"
        name="locationConfirmed"
        value={value.locationConfirmed}
      />
      <input
        type="hidden"
        name="geocodingProvider"
        value={value.geocodingProvider}
      />
      <input
        type="hidden"
        name="geocodingPlaceId"
        value={value.geocodingPlaceId}
      />
      <input
        type="hidden"
        name="geocodingConfidence"
        value={value.geocodingConfidence}
      />
    </div>
  );
}

"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  Loader2,
  LocateFixed,
  MapPin,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveMapsLink } from "@/lib/actions/listing.actions";
import { parseCoordsFromMapsText } from "@/lib/utils/parse-maps-link";

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

export function ListingLocationField({
  value,
  onChange,
}: {
  value: ListingLocationValue;
  onChange: (patch: Partial<ListingLocationValue>) => void;
}) {
  const initialLat = finiteCoordinate(value.latitude, -90, 90);
  const initialLng = finiteCoordinate(value.longitude, -180, 180);
  const hasPin = initialLat !== null && initialLng !== null;
  const [mapCenter, setMapCenter] = React.useState<[number, number]>(
    hasPin ? [initialLat, initialLng] : WORLD_CENTER
  );
  const [query, setQuery] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<LocationSuggestion[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [activeSuggestion, setActiveSuggestion] = React.useState(-1);
  const [linkValue, setLinkValue] = React.useState("");
  const [resolving, setResolving] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const searchRequestRef = React.useRef(0);
  const reverseRequestRef = React.useRef(0);
  const selectedQueryRef = React.useRef("");

  React.useEffect(() => {
    if (hasPin) return;

    const controller = new AbortController();
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
        if (payload?.result) {
          setMapCenter([
            payload.result.latitude,
            payload.result.longitude,
          ]);
        }
      })
      .catch(() => {
        // IP location is only a convenience; the world view remains usable.
      });

    return () => controller.abort();
  }, [hasPin, initialLat, initialLng]);

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
    onChange({
      address: result.address || value.address,
      city: result.city || value.city,
      area: result.area || value.area,
      postalCode: result.postalCode || value.postalCode,
      country: result.country || value.country,
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
        applyGeocodedLocation(payload.result, source);
      }
    } catch {
      // The exact pin remains valid even when no address can be resolved.
    } finally {
      if (request === reverseRequestRef.current) setResolving(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error("Current location is not available in this browser");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void setCoordinates(
          position.coords.latitude,
          position.coords.longitude,
          "BROWSER_LOCATION"
        ).finally(() => setLocating(false));
      },
      (error) => {
        setLocating(false);
        toast.error(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied"
            : "We couldn't determine your current location"
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }
    );
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
        <Label htmlFor="address-search">Search for the property address</Label>
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
            onClick={useCurrentLocation}
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
      </div>

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

      <details className="rounded-lg border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">
          Other ways to set the location
        </summary>
        <div className="mt-3 space-y-2">
          <Label htmlFor="maps-link" className="text-xs">
            Paste a Google Maps link or coordinates
          </Label>
          <div className="flex gap-2">
            <Input
              id="maps-link"
              placeholder="Google Maps link or 'lat, lng'"
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
              variant="outline"
              onClick={() => void applyLink()}
              disabled={resolving}
            >
              {resolving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              Use link
            </Button>
          </div>
        </div>
      </details>

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

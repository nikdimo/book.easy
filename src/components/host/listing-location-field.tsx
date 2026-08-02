"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Link2, Loader2, LocateFixed, MapPin, Search } from "lucide-react";
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
import { cn } from "@/lib/utils";
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
  streetViewHeading: string;
  streetViewPitch: string;
  streetViewPanoId: string;
};

/** A resolved location with full coordinates and address parts — what place-details,
 *  reverse-geocode, and the maps-link flow all eventually produce. */
type ResolvedLocation = {
  label: string;
  address: string;
  city: string;
  area: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
  placeId: string;
};

/** An autocomplete row — Google intentionally doesn't include coordinates here; a
 *  follow-up place-details call (billed together with this as one cheap "session",
 *  see sessionTokenRef) resolves the pick into a ResolvedLocation. */
type PlacePrediction = {
  placeId: string;
  label: string;
};

type IpLocation = {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  countryCode: string;
};

export function finiteCoordinate(value: string, min: number, max: number) {
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

function newSessionToken() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Step 1 of 3 for location: put the pin on the map. Searching or dropping the pin is
 *  what fills in the address text, so this comes before the address fields rather
 *  than after them — the host types a place name once instead of a full address. */
export function ListingLocationMapField({
  value,
  onChange,
  onResolvingChange,
  active = true,
  heading = true,
}: {
  value: ListingLocationValue;
  onChange: (patch: Partial<ListingLocationValue>) => void;
  /** Reverse geocoding runs here but fills in the *next* step's fields, which would
   *  otherwise sit blank for a second or two with no explanation — exactly what makes
   *  a host think the address auto-fill is broken. */
  onResolvingChange?: (resolving: boolean) => void;
  /** Whether this field is the step the host is currently looking at. The listing
   *  wizard keeps every step's fields mounted at once (just hidden via CSS) so it can
   *  validate and preview across steps — without this, the geolocation prompt below
   *  would fire the moment the wizard first loads (step 1), not when the host actually
   *  reaches the location step, which is both surprising and something some browsers
   *  quietly refuse to prompt for outside a real user action. */
  active?: boolean;
  heading?: boolean;
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
  const [predictions, setPredictions] = React.useState<PlacePrediction[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState("");
  const [activePrediction, setActivePrediction] = React.useState(-1);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkValue, setLinkValue] = React.useState("");
  const [resolving, setResolving] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = React.useState(false);
  const [locationMessage, setLocationMessage] = React.useState("");
  const abortRef = React.useRef<AbortController | null>(null);
  const searchRequestRef = React.useRef(0);
  const reverseRequestRef = React.useRef(0);
  const selectedQueryRef = React.useRef("");
  const sessionTokenRef = React.useRef(newSessionToken());
  const onResolvingChangeRef = React.useRef(onResolvingChange);

  React.useEffect(() => {
    onResolvingChangeRef.current = onResolvingChange;
  }, [onResolvingChange]);

  React.useEffect(() => {
    onResolvingChangeRef.current?.(resolving);
  }, [resolving]);

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

    if (normalized.length < 2 || normalized === selectedQueryRef.current) {
      setPredictions([]);
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
          sessionToken: sessionTokenRef.current,
          language: preferredLanguage(),
          bias: { latitude: mapCenter[0], longitude: mapCenter[1] },
        }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            results?: PlacePrediction[];
            error?: string;
          };
          if (!response.ok) throw new Error(payload.error || "Address search failed");
          return payload.results ?? [];
        })
        .then((results) => {
          if (request === searchRequestRef.current) setPredictions(results);
        })
        .catch((error) => {
          if (error instanceof Error && error.name === "AbortError") return;
          if (request === searchRequestRef.current) {
            setPredictions([]);
            setSearchError(
              error instanceof Error ? error.message : "Address search is unavailable"
            );
          }
        })
        .finally(() => {
          if (request === searchRequestRef.current) setSearching(false);
        });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [mapCenter, query]);

  /** Common tail for every method that resolves to a full location: recenters the
   *  map and writes the new fields — always as-is,
   *  including empty ones. The parent (listing-form.tsx) is what actually decides
   *  whether to apply each address field or keep a manual edit; sending a stale
   *  fallback here is what used to leave old text sitting next to a brand new pin. */
  function applyResolvedLocation(
    result: ResolvedLocation,
    source: "AUTOCOMPLETE" | "MANUAL_PIN" | "BROWSER_LOCATION" | "MAPS_LINK"
  ) {
    setMapCenter([result.latitude, result.longitude]);
    onChange({
      address: result.address,
      city: result.city,
      area: result.area,
      postalCode: result.postalCode,
      country: result.country,
      latitude: String(result.latitude),
      longitude: String(result.longitude),
      locationSource: source,
      locationConfirmed: "false",
      geocodingProvider: source === "AUTOCOMPLETE" ? "GOOGLE_PLACES" : "GEOAPIFY",
      geocodingPlaceId: result.placeId,
      geocodingConfidence: "",
    });
  }

  function selectPrediction(prediction: PlacePrediction) {
    abortRef.current?.abort();
    selectedQueryRef.current = prediction.label;
    setQuery(prediction.label);
    setPredictions([]);
    setSearchError("");
    setActivePrediction(-1);

    setResolving(true);
    void fetch("/api/location/place-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placeId: prediction.placeId,
        sessionToken: sessionTokenRef.current,
        language: preferredLanguage(),
      }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          result?: ResolvedLocation | null;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Couldn't look up that place");
        if (!payload.result) throw new Error("Couldn't look up that place");
        applyResolvedLocation(payload.result, "AUTOCOMPLETE");
        // A session ends once Details is called — start a fresh token for the next
        // search rather than keep billing further keystrokes against this one.
        sessionTokenRef.current = newSessionToken();
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Couldn't look up that place");
      })
      .finally(() => setResolving(false));
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
      locationConfirmed: "false",
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
        result?: ResolvedLocation | null;
      };
      if (request === reverseRequestRef.current && response.ok && payload.result) {
        // Reverse geocoding returns the nearest known address's own coordinates,
        // rarely the exact spot clicked/dragged — keep the pin exactly where the host
        // put it and only take the address text from this result.
        onChange({
          address: payload.result.address,
          city: payload.result.city,
          area: payload.result.area,
          postalCode: payload.result.postalCode,
          country: payload.result.country,
          latitude: String(latitude),
          longitude: String(longitude),
          locationSource: source,
          locationConfirmed: "false",
          geocodingProvider: "GEOAPIFY",
          geocodingPlaceId: payload.result.placeId,
          geocodingConfidence: "",
        });
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
      const message = "Current location is only available on a secure HTTPS connection.";
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

          void setCoordinates(latitude, longitude, "BROWSER_LOCATION")
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
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 }
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
  const locationSummary = hasPin
    ? [value.address, value.city, value.country].filter(Boolean).join(", ") ||
      `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
    : "";

  return (
    // notranslate: this form swaps between different icon/text subtrees in several
    // places (loading spinners, the coordinate readout) as state changes. Google
    // Translate's live DOM translation restructures whatever it touches, and React's
    // next update to that same subtree can then throw ("insertBefore: not a child of
    // this node"). This whole form is host-only, plain-English UI with no i18n
    // integration already, so nothing is lost by keeping Translate out of it.
    <div className="notranslate space-y-3">
      {heading && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight md:text-2xl">
            Where is your property?
          </h2>
          <p className="mt-1 text-xs text-muted-foreground md:text-sm">
            Search for it, or move the map so the pin sits exactly where guests
            will stay. Only you see this precise spot for now.
          </p>
        </div>
      )}

      {/* Full-bleed on phones: the map is the step, so the 16px gutters were
          costing it width it actually uses. */}
      <div className="relative -mx-4 min-h-[16rem] overflow-hidden border-y bg-muted md:mx-0 md:min-h-[22rem] md:rounded-xl md:border">
        <ListingLocationPickerInner
          lat={latitude}
          lng={longitude}
          hasPin={hasPin}
          zoom={hasPin ? 16 : mapZoom}
          className={cn(
            "h-[38dvh] min-h-[16rem] w-full md:h-[min(60vh,34rem)] md:min-h-[22rem]",
            resolving && "pointer-events-none"
          )}
          onChange={(nextLat, nextLng) => {
            void setCoordinates(nextLat, nextLng, "MANUAL_PIN");
          }}
        />

        <div className="absolute left-4 right-4 top-4 z-10 max-w-xl space-y-2 lg:right-auto lg:w-[min(34rem,calc(100%-2rem))]">
          <div className="relative rounded-xl bg-background shadow-[0_4px_24px_rgba(0,0,0,0.22)]">
            <Search className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input
              id="address-search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={predictions.length > 0}
              aria-controls="address-search-results"
              aria-activedescendant={
                activePrediction >= 0
                  ? `address-result-${activePrediction}`
                  : undefined
              }
              autoComplete="off"
              className="h-12 border-0 bg-transparent pl-12 pr-11 text-base shadow-none focus-visible:ring-0"
              placeholder="Search Google for an address or place"
              value={query}
              disabled={resolving}
              onChange={(event) => {
                const nextQuery = event.target.value;
                selectedQueryRef.current = "";
                setQuery(nextQuery);
                setActivePrediction(-1);
                if (nextQuery.trim().length < 2) {
                  setPredictions([]);
                  setSearching(false);
                  setSearchError("");
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && predictions.length > 0) {
                  event.preventDefault();
                  setActivePrediction((current) =>
                    Math.min(predictions.length - 1, current + 1)
                  );
                } else if (event.key === "ArrowUp" && predictions.length > 0) {
                  event.preventDefault();
                  setActivePrediction((current) => Math.max(0, current - 1));
                } else if (event.key === "Enter" && predictions.length > 0) {
                  event.preventDefault();
                  selectPrediction(
                    predictions[activePrediction >= 0 ? activePrediction : 0]
                  );
                } else if (event.key === "Escape") {
                  setPredictions([]);
                  setActivePrediction(-1);
                }
              }}
              onBlur={() => {
                window.setTimeout(() => setPredictions([]), 150);
              }}
            />
            <Loader2
              className={cn(
                "pointer-events-none absolute right-4 top-3.5 h-5 w-5 animate-spin text-muted-foreground",
                !searching && !resolving && "invisible"
              )}
              aria-hidden="true"
            />
            {predictions.length > 0 && (
              <div
                id="address-search-results"
                role="listbox"
                className="absolute left-0 right-0 top-[calc(100%+0.5rem)] max-h-72 overflow-y-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl"
              >
                {predictions.map((prediction, index) => (
                  <button
                    id={`address-result-${index}`}
                    key={prediction.placeId}
                    type="button"
                    role="option"
                    aria-selected={activePrediction === index}
                    className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left text-sm ${
                      activePrediction === index ? "bg-muted" : "hover:bg-muted"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectPrediction(prediction)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{prediction.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {searchError && (
            <p className="rounded-lg bg-background/95 px-3 py-2 text-sm md:text-xs text-destructive shadow">
              {searchError}
            </p>
          )}
          {linkOpen && (
            <div className="flex gap-2 rounded-xl bg-background p-2 shadow-lg">
              <Input
                placeholder="Paste a Google Maps link"
                value={linkValue}
                autoFocus
                disabled={resolving}
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
                Use link
              </Button>
            </div>
          )}
        </div>

        <div className="absolute bottom-5 left-4 z-10 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="bg-background shadow-lg hover:bg-background/90"
            disabled={locating || resolving}
            onClick={() => setLocationDialogOpen(true)}
          >
            <span className="relative h-4 w-4 shrink-0" aria-hidden="true">
              <Loader2
                className={cn(
                  "absolute inset-0 h-4 w-4 animate-spin",
                  !locating && "invisible"
                )}
              />
              <LocateFixed
                className={cn("absolute inset-0 h-4 w-4", locating && "invisible")}
              />
            </span>
            My location
          </Button>
          {!linkOpen && (
            <Button
              type="button"
              variant="secondary"
              className="bg-background shadow-lg hover:bg-background/90"
              disabled={resolving}
              onClick={() => setLinkOpen(true)}
            >
              <Link2 className="h-4 w-4" />
              Maps link
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-[3.5rem] rounded-xl border bg-muted/35 p-3">
        {hasPin ? (
          <>
            <p className="flex items-start gap-2 text-sm font-medium">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{locationSummary}</span>
            </p>
            <p className="mt-2 pl-6 text-sm md:text-xs text-muted-foreground">
              {resolving
                ? "Finding the address…"
                : locationMessage ||
                  `${latitude.toFixed(6)}, ${longitude.toFixed(6)} · move the map under the pin, or drag the pin itself, to fine-tune the entrance`}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {locationMessage ||
              "No pin yet — search above or click the map to place one."}
          </p>
        )}
      </div>

      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent variant="sheet" className="min-w-0 overflow-x-hidden overflow-y-auto md:max-h-[calc(100dvh-2rem)] md:w-[calc(100vw-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle className="pr-8 leading-snug">
              Are you at the property now?
            </DialogTitle>
            <DialogDescription className="break-words leading-relaxed">
              Choose yes only if you are physically at the property. Your
              browser will then ask whether Linger Homes may use your current
              location. You can deny the request and continue by searching or
              selecting the property on the map.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-col-reverse sm:justify-stretch">
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-10 min-w-0 w-full whitespace-normal px-4 py-2 text-center leading-snug"
              onClick={() => setLocationDialogOpen(false)}
            >
              <span className="min-w-0 break-words">
                No, I&apos;ll choose it
              </span>
            </Button>
            <Button
              type="button"
              className="h-auto min-h-10 min-w-0 w-full whitespace-normal px-4 py-2 text-center leading-snug"
              onClick={requestCurrentLocation}
            >
              <LocateFixed className="h-4 w-4 shrink-0" />
              <span className="min-w-0 break-words">Yes, use where I am</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input type="hidden" name="latitude" value={value.latitude} />
      <input type="hidden" name="longitude" value={value.longitude} />
      <input type="hidden" name="locationSource" value={value.locationSource} />
      <input type="hidden" name="locationConfirmed" value={value.locationConfirmed} />
      <input type="hidden" name="geocodingProvider" value={value.geocodingProvider} />
      <input type="hidden" name="geocodingPlaceId" value={value.geocodingPlaceId} />
      <input type="hidden" name="geocodingConfidence" value={value.geocodingConfidence} />
    </div>
  );
}

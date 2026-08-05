"use client";

import * as React from "react";
import { Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadGoogleMaps } from "@/lib/google-maps-browser";
import { Tx } from "@/lib/i18n/client";

type MapsListener = { remove(): void };
type GoogleLatLng = { lat(): number; lng(): number };
type GoogleMap = {
  addListener(
    event: "click" | "dragstart" | "drag" | "dragend" | "idle" | "zoom_changed",
    handler: (event: { latLng?: GoogleLatLng }) => void
  ): MapsListener;
  getCenter(): GoogleLatLng | undefined;
  getZoom(): number | undefined;
  panTo(position: { lat: number; lng: number }): void;
  setCenter(position: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
};
type MapConstructor = new (
  container: HTMLElement,
  options: {
    center: { lat: number; lng: number };
    zoom: number;
    mapId: string;
    cameraControl: boolean;
    clickableIcons: boolean;
    fullscreenControl: boolean;
    mapTypeControl: boolean;
    streetViewControl: boolean;
    zoomControl: boolean;
    gestureHandling: string;
    keyboardShortcuts: boolean;
  }
) => GoogleMap;

/** Coordinates round-trip through React state as strings, so "the same spot" has to be
 *  a tolerance rather than an equality check. ~1cm — far below anything a host can aim. */
const COORDINATE_EPSILON = 1e-7;

function sameSpot(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  return (
    Math.abs(a.lat - b.lat) < COORDINATE_EPSILON &&
    Math.abs(a.lng - b.lng) < COORDINATE_EPSILON
  );
}

/**
 * A centre-pin picker, the pattern every phone map app converged on: the pin is a
 * fixed piece of UI at the middle of the viewport and the *map* moves underneath it.
 *
 * There is deliberately no draggable map marker any more. Having both a draggable pin
 * and a moving map meant two ways to aim the same thing, each with its own feel — and
 * the draggable one put the target under the host's own finger at the exact moment
 * they needed to see it.
 */
export default function ListingLocationPickerInner({
  lat,
  lng,
  hasPin,
  zoom = 2,
  onChange = () => undefined,
  className,
  interactive = true,
}: {
  lat: number;
  lng: number;
  hasPin: boolean;
  zoom?: number;
  onChange?: (lat: number, lng: number) => void;
  className?: string;
  interactive?: boolean;
}) {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_JAVASCRIPT_API_KEY?.trim();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<GoogleMap | null>(null);
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const listenersRef = React.useRef<MapsListener[]>([]);
  const onChangeRef = React.useRef(onChange);
  const initialOptionsRef = React.useRef({ lat, lng, hasPin, zoom });
  const lastEmittedRef = React.useRef<{ lat: number; lng: number } | null>(null);
  /** The map settles (`idle`) after our own programmatic pans and after the very first
   *  render too. Without this flag the first idle would drop a pin in the middle of
   *  whatever coarse view the map opened on — a location the host never chose. */
  const userGesturedRef = React.useRef(false);
  /** Where the map's centre already is (or is animating to) because of a gesture we
   *  just handled — the one case where the coordinates coming back down as props must
   *  not move the camera again. Null means the camera still has to travel. */
  const settledCenterRef = React.useRef<{ lat: number; lng: number } | null>(null);
  const [ready, setReady] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  /** Lifts the pin off the map while the map slides underneath it, so the gesture
   *  reads as "aiming" rather than "the pin is stuck". */
  const [panning, setPanning] = React.useState(false);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    initialOptionsRef.current = { lat, lng, hasPin, zoom };
  }, [hasPin, lat, lng, zoom]);

  /** Reports a new pin position, ignoring the echoes: the map fires `idle` after our
   *  own programmatic pans too, and re-reporting a spot we just reported would kick off
   *  a second reverse-geocode for a pin that never moved. */
  const emitPosition = React.useCallback(
    (nextLat: number, nextLng: number, centered: boolean) => {
      const next = { lat: nextLat, lng: nextLng };
      const current = initialOptionsRef.current;
      settledCenterRef.current = centered ? next : null;
      if (current.hasPin && sameSpot(next, current)) return;
      if (lastEmittedRef.current && sameSpot(next, lastEmittedRef.current)) return;
      lastEmittedRef.current = next;
      onChangeRef.current(nextLat, nextLng);
    },
    []
  );

  React.useEffect(() => {
    if (!key) return;
    let cancelled = false;

    void loadGoogleMaps(key)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const MapClass = maps.Map as MapConstructor;
        const initial = initialOptionsRef.current;
        const map = new MapClass(containerRef.current, {
          center: { lat: initial.lat, lng: initial.lng },
          zoom: initial.hasPin ? 17 : initial.zoom,
          mapId: "DEMO_MAP_ID",
          cameraControl: false,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          zoomControl: interactive,
          gestureHandling: interactive ? "greedy" : "none",
          keyboardShortcuts: interactive,
        });

        mapRef.current = map;
        resizeObserverRef.current = new ResizeObserver(() => {
          const current = initialOptionsRef.current;
          window.requestAnimationFrame(() => {
            map.setCenter({ lat: current.lat, lng: current.lng });
          });
        });
        resizeObserverRef.current.observe(containerRef.current);
        if (interactive) {
          listenersRef.current.push(
            map.addListener("click", (event) => {
              if (event.latLng) {
                userGesturedRef.current = true;
                // Not centred yet — the prop round-trip below is what glides the
                // tapped spot into the middle of the map, under the pin.
                emitPosition(event.latLng.lat(), event.latLng.lng(), false);
              }
            }),
            map.addListener("dragstart", () => {
              userGesturedRef.current = true;
              setPanning(true);
            }),
            map.addListener("dragend", () => setPanning(false)),
            map.addListener("zoom_changed", () => {
              userGesturedRef.current = true;
            }),
            map.addListener("idle", () => {
              setPanning(false);
              const current = initialOptionsRef.current;
              // Before the host has aimed at anything, the centre is just wherever
              // the coarse opening view landed — not a choice worth committing.
              if (!current.hasPin && !userGesturedRef.current) return;
              const center = map.getCenter();
              if (!center) return;
              emitPosition(center.lat(), center.lng(), true);
            })
          );
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });

    return () => {
      cancelled = true;
      for (const listener of listenersRef.current) listener.remove();
      listenersRef.current = [];
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      mapRef.current = null;
    };
  }, [emitPosition, interactive, key]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const position = { lat, lng };
    // A pan or a tap already left the map exactly where these coordinates came from —
    // re-centring and re-zooming it here is what made the map jump under the host
    // mid-gesture (and snapped their zoom-out back to street level every time).
    const alreadyCentered =
      settledCenterRef.current !== null && sameSpot(settledCenterRef.current, position);
    if (alreadyCentered) return;

    // panTo, not setCenter: nearby moves glide, so the map visibly slides under the
    // pin instead of teleporting.
    map.panTo(position);
    map.setZoom(hasPin ? Math.max(map.getZoom() ?? 17, 17) : zoom);
  }, [hasPin, lat, lng, zoom]);

  if (!key) {
    return (
      <div className={cn("flex items-center justify-center bg-muted", className)}>
        <p className="text-sm text-muted-foreground">
          <Tx k="host.map.not_configured" source="Google Maps isn't configured." />
        </p>
      </div>
    );
  }

  return (
    <div className={cn("relative isolate overflow-hidden bg-muted", className)}>
      {/* Exactly the wrapper's box — a min-height here would push the map's own
          centre away from the wrapper's centre, and the pin is positioned against
          the wrapper. */}
      <div ref={containerRef} className="h-full w-full" />

      {/* The pin lives in the DOM at the exact centre of the map, not on the map. It
          is never draggable and never lags the gesture. */}
      {ready && !loadFailed && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          aria-hidden="true"
        >
          <div className="relative">
            <MapPin
              className={cn(
                "h-10 w-10 -translate-y-[50%] fill-primary text-primary drop-shadow-[0_3px_6px_rgba(0,0,0,0.35)] transition-transform duration-150",
                panning && "-translate-y-[65%] scale-105"
              )}
              strokeWidth={1.5}
            />
            {/* The exact spot the tip points at, so there is no doubt about which
                pixel the coordinates refer to while the pin is lifted. */}
            <span
              className={cn(
                "absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/60 transition-opacity duration-150",
                panning ? "opacity-100" : "opacity-0"
              )}
            />
          </div>
        </div>
      )}

      {!ready && !loadFailed && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <Tx k="host.map.loading" source="Loading Google Maps…" />
        </div>
      )}
      {loadFailed && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-muted px-6 text-center text-sm text-destructive">
          <MapPin className="h-4 w-4" />
          <Tx
            k="host.map.load_failed"
            source="Google Maps couldn't load. Check the API key restrictions."
          />
        </div>
      )}
    </div>
  );
}

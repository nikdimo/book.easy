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
    event: "click" | "drag" | "idle",
    handler: (event: { latLng?: GoogleLatLng }) => void
  ): MapsListener;
  getCenter(): GoogleLatLng | undefined;
  getZoom(): number | undefined;
  panTo(position: { lat: number; lng: number }): void;
  setCenter(position: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
};
type GoogleMarker = {
  addListener(
    event: "dragstart" | "dragend",
    handler: (event: { latLng?: GoogleLatLng }) => void
  ): MapsListener;
  map: GoogleMap | null;
  position: { lat: number; lng: number } | GoogleLatLng | null;
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
type MarkerConstructor = new (options: {
  map: GoogleMap;
  position: { lat: number; lng: number };
  gmpDraggable: boolean;
  title: string;
}) => GoogleMarker;

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

export default function ListingLocationPickerInner({
  lat,
  lng,
  hasPin,
  zoom = 2,
  onChange,
  className,
  interactive = true,
}: {
  lat: number;
  lng: number;
  hasPin: boolean;
  zoom?: number;
  onChange: (lat: number, lng: number) => void;
  className?: string;
  interactive?: boolean;
}) {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_JAVASCRIPT_API_KEY?.trim();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<GoogleMap | null>(null);
  const markerRef = React.useRef<GoogleMarker | null>(null);
  const markerConstructorRef = React.useRef<MarkerConstructor | null>(null);
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const listenersRef = React.useRef<MapsListener[]>([]);
  const onChangeRef = React.useRef(onChange);
  const initialOptionsRef = React.useRef({ lat, lng, hasPin, zoom });
  const markerDraggingRef = React.useRef(false);
  const lastEmittedRef = React.useRef<{ lat: number; lng: number } | null>(null);
  /** Where the map's centre already is (or is animating to) because of a gesture we
   *  just handled — the one case where the coordinates coming back down as props must
   *  not move the camera again. Null means the camera still has to travel. */
  const settledCenterRef = React.useRef<{ lat: number; lng: number } | null>(null);
  const [ready, setReady] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);

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

  /** Dragging the pin itself is the one way it leaves the centre — so once it's dropped,
   *  glide the map under it until it's centred again rather than snapping. */
  const attachMarkerListeners = React.useCallback(
    (map: GoogleMap, marker: GoogleMarker) => {
      listenersRef.current.push(
        marker.addListener("dragstart", () => {
          markerDraggingRef.current = true;
        }),
        marker.addListener("dragend", (event) => {
          markerDraggingRef.current = false;
          if (!event.latLng) return;
          const nextLat = event.latLng.lat();
          const nextLng = event.latLng.lng();
          map.panTo({ lat: nextLat, lng: nextLng });
          emitPosition(nextLat, nextLng, true);
        })
      );
    },
    [emitPosition]
  );

  React.useEffect(() => {
    if (!key) return;
    let cancelled = false;

    void loadGoogleMaps(key)
      .then((maps) => {
        if (cancelled || !containerRef.current) return;
        const MapClass = maps.Map as MapConstructor;
        const MarkerClass = (
          maps.marker as { AdvancedMarkerElement: MarkerConstructor }
        ).AdvancedMarkerElement;
        const initial = initialOptionsRef.current;
        const map = new MapClass(containerRef.current, {
          center: { lat: initial.lat, lng: initial.lng },
          zoom: initial.hasPin ? 17 : initial.zoom,
          mapId: "DEMO_MAP_ID",
          cameraControl: interactive,
          clickableIcons: false,
          fullscreenControl: interactive,
          mapTypeControl: interactive,
          streetViewControl: false,
          zoomControl: interactive,
          gestureHandling: interactive ? "greedy" : "none",
          keyboardShortcuts: interactive,
        });

        mapRef.current = map;
        markerConstructorRef.current = MarkerClass;
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
                // Not centred yet — the prop round-trip below is what glides the
                // clicked spot into the middle of the map.
                emitPosition(event.latLng.lat(), event.latLng.lng(), false);
              }
            }),
            // The pin rides the centre of the map: aiming it means moving the map
            // under it, the way every phone map app does it, so the pin never ends up
            // hidden under the host's own finger.
            map.addListener("drag", () => {
              const marker = markerRef.current;
              if (!marker || markerDraggingRef.current) return;
              const center = map.getCenter();
              if (center) marker.position = { lat: center.lat(), lng: center.lng() };
            }),
            map.addListener("idle", () => {
              const marker = markerRef.current;
              if (!marker || markerDraggingRef.current) return;
              const center = map.getCenter();
              if (!center) return;
              const nextLat = center.lat();
              const nextLng = center.lng();
              marker.position = { lat: nextLat, lng: nextLng };
              emitPosition(nextLat, nextLng, true);
            })
          );
        }

        const current = initialOptionsRef.current;
        if (current.hasPin) {
          const marker = new MarkerClass({
            map,
            position: { lat: current.lat, lng: current.lng },
            gmpDraggable: interactive,
            title: "Property location",
          });
          markerRef.current = marker;
          if (interactive) attachMarkerListeners(map, marker);
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
      if (markerRef.current) markerRef.current.map = null;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      markerRef.current = null;
      markerConstructorRef.current = null;
      mapRef.current = null;
    };
  }, [attachMarkerListeners, emitPosition, interactive, key]);

  React.useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerConstructorRef.current;
    if (!map) return;

    const position = { lat, lng };
    // A pan or a pin drop already left the map exactly where these coordinates came
    // from — re-centring and re-zooming it here is what made the map jump under the
    // host mid-gesture (and snapped their zoom-out back to street level every time).
    const alreadyCentered =
      settledCenterRef.current !== null && sameSpot(settledCenterRef.current, position);
    if (!alreadyCentered) {
      // panTo, not setCenter: nearby moves glide, so the pin visibly slides back to
      // the centre instead of teleporting there.
      map.panTo(position);
      map.setZoom(hasPin ? Math.max(map.getZoom() ?? 17, 17) : zoom);
    }

    if (!hasPin) {
      if (markerRef.current) markerRef.current.map = null;
      markerRef.current = null;
      return;
    }

    if (!markerRef.current && MarkerClass) {
      const marker = new MarkerClass({
        map,
        position,
        gmpDraggable: interactive,
        title: "Property location",
      });
      markerRef.current = marker;
      if (interactive) attachMarkerListeners(map, marker);
    } else if (markerRef.current) {
      markerRef.current.position = position;
    }
  }, [attachMarkerListeners, hasPin, interactive, lat, lng, zoom]);

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
      <div ref={containerRef} className="h-full min-h-96 w-full" />
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

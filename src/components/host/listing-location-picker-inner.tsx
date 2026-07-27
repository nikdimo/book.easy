"use client";

import * as React from "react";
import { Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadGoogleMaps } from "@/lib/google-maps-browser";

type MapsListener = { remove(): void };
type GoogleLatLng = { lat(): number; lng(): number };
type GoogleMap = {
  addListener(
    event: "click",
    handler: (event: { latLng?: GoogleLatLng }) => void
  ): MapsListener;
  getZoom(): number | undefined;
  setCenter(position: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
};
type GoogleMarker = {
  addListener(
    event: "dragend",
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
    clickableIcons: boolean;
    fullscreenControl: boolean;
    mapTypeControl: boolean;
    streetViewControl: boolean;
    zoomControl: boolean;
    gestureHandling: string;
  }
) => GoogleMap;
type MarkerConstructor = new (options: {
  map: GoogleMap;
  position: { lat: number; lng: number };
  gmpDraggable: boolean;
  title: string;
}) => GoogleMarker;

export default function ListingLocationPickerInner({
  lat,
  lng,
  hasPin,
  zoom = 2,
  onChange,
  className,
}: {
  lat: number;
  lng: number;
  hasPin: boolean;
  zoom?: number;
  onChange: (lat: number, lng: number) => void;
  className?: string;
}) {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_JAVASCRIPT_API_KEY?.trim();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<GoogleMap | null>(null);
  const markerRef = React.useRef<GoogleMarker | null>(null);
  const markerConstructorRef = React.useRef<MarkerConstructor | null>(null);
  const listenersRef = React.useRef<MapsListener[]>([]);
  const onChangeRef = React.useRef(onChange);
  const initialOptionsRef = React.useRef({ lat, lng, hasPin, zoom });
  const [ready, setReady] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    initialOptionsRef.current = { lat, lng, hasPin, zoom };
  }, [hasPin, lat, lng, zoom]);

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
          clickableIcons: false,
          fullscreenControl: true,
          mapTypeControl: true,
          streetViewControl: false,
          zoomControl: true,
          gestureHandling: "greedy",
        });

        mapRef.current = map;
        markerConstructorRef.current = MarkerClass;
        listenersRef.current.push(
          map.addListener("click", (event) => {
            if (event.latLng) {
              onChangeRef.current(event.latLng.lat(), event.latLng.lng());
            }
          })
        );

        const current = initialOptionsRef.current;
        if (current.hasPin) {
          const marker = new MarkerClass({
            map,
            position: { lat: current.lat, lng: current.lng },
            gmpDraggable: true,
            title: "Property location",
          });
          markerRef.current = marker;
          listenersRef.current.push(
            marker.addListener("dragend", (event) => {
              if (event.latLng) {
                onChangeRef.current(event.latLng.lat(), event.latLng.lng());
              }
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
      if (markerRef.current) markerRef.current.map = null;
      markerRef.current = null;
      markerConstructorRef.current = null;
      mapRef.current = null;
    };
  }, [key]);

  React.useEffect(() => {
    const map = mapRef.current;
    const MarkerClass = markerConstructorRef.current;
    if (!map) return;

    const position = { lat, lng };
    map.setCenter(position);
    map.setZoom(hasPin ? Math.max(map.getZoom() ?? 17, 17) : zoom);

    if (!hasPin) {
      if (markerRef.current) markerRef.current.map = null;
      markerRef.current = null;
      return;
    }

    if (!markerRef.current && MarkerClass) {
      const marker = new MarkerClass({
        map,
        position,
        gmpDraggable: true,
        title: "Property location",
      });
      markerRef.current = marker;
      listenersRef.current.push(
        marker.addListener("dragend", (event) => {
          if (event.latLng) {
            onChangeRef.current(event.latLng.lat(), event.latLng.lng());
          }
        })
      );
    } else if (markerRef.current) {
      markerRef.current.position = position;
    }
  }, [hasPin, lat, lng, zoom]);

  if (!key) {
    return (
      <div className={cn("flex items-center justify-center bg-muted", className)}>
        <p className="text-sm text-muted-foreground">
          Google Maps isn&apos;t configured.
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
          Loading Google Maps…
        </div>
      )}
      {loadFailed && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-muted px-6 text-center text-sm text-destructive">
          <MapPin className="h-4 w-4" />
          Google Maps couldn&apos;t load. Check the API key restrictions.
        </div>
      )}
    </div>
  );
}

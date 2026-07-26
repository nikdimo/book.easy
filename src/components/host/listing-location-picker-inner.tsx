"use client";

import * as React from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { cn } from "@/lib/utils";

const markerIcon = L.divIcon({
  className: "!border-0 !bg-transparent",
  html: `<div style="width:24px;height:24px;border-radius:50% 50% 50% 0;background:var(--color-primary, #7c3f2e);transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,0.4);"></div>`,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
});

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function KeepMapSized() {
  const map = useMap();

  React.useEffect(() => {
    const container = map.getContainer();
    let frame = 0;

    const refresh = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          map.invalidateSize({ pan: false });
        }
      });
    };

    const observer = new ResizeObserver(refresh);
    observer.observe(container);
    if (container.parentElement) observer.observe(container.parentElement);
    window.addEventListener("resize", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.cancelAnimationFrame(frame);
    };
  }, [map]);

  return null;
}

function RecenterOnChange({
  position,
  hasPin,
  zoom,
}: {
  position: [number, number];
  hasPin: boolean;
  /** Zoom to use while there's no pin yet — e.g. tighter once a location signal
   *  (device GPS or IP) narrows down where the host probably is. Ignored once a pin
   *  is placed, when the map always zooms to at least street level. */
  zoom: number;
}) {
  const map = useMap();
  const prev = React.useRef(position);
  const prevZoom = React.useRef(zoom);
  React.useEffect(() => {
    const positionChanged = prev.current[0] !== position[0] || prev.current[1] !== position[1];
    const zoomChanged = prevZoom.current !== zoom;
    if (positionChanged || (zoomChanged && !hasPin)) {
      map.setView(position, hasPin ? Math.max(map.getZoom(), 13) : zoom, {
        animate: true,
      });
      prev.current = position;
      prevZoom.current = zoom;
    }
  }, [hasPin, map, position, zoom]);
  return null;
}

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
  /** Zoom to use before a pin is placed. Defaults to the whole-world view. */
  zoom?: number;
  onChange: (lat: number, lng: number) => void;
  className?: string;
}) {
  const position: [number, number] = [lat, lng];
  const geoapifyMapsKey = process.env.NEXT_PUBLIC_GEOAPIFY_MAPS_KEY?.trim();

  return (
    <div className={cn("overflow-hidden rounded-lg border", className)}>
      <MapContainer
        center={position}
        zoom={hasPin ? 13 : zoom}
        className="h-full w-full min-h-[280px] z-0"
        scrollWheelZoom
      >
        {geoapifyMapsKey ? (
          <TileLayer
            attribution='&copy; <a href="https://www.geoapify.com/">Geoapify</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url={`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=${geoapifyMapsKey}`}
          />
        ) : (
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        )}
        <KeepMapSized />
        <ClickToPlace onPick={onChange} />
        <RecenterOnChange position={position} hasPin={hasPin} zoom={zoom} />
        {hasPin && (
          <Marker
            position={position}
            icon={markerIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const m = e.target as L.Marker;
                const { lat: newLat, lng: newLng } = m.getLatLng();
                onChange(newLat, newLng);
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}

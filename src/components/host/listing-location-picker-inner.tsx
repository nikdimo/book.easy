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

function RecenterOnChange({ position }: { position: [number, number] }) {
  const map = useMap();
  const prev = React.useRef(position);
  React.useEffect(() => {
    if (prev.current[0] !== position[0] || prev.current[1] !== position[1]) {
      map.setView(position, map.getZoom(), { animate: true });
      prev.current = position;
    }
  }, [map, position]);
  return null;
}

export default function ListingLocationPickerInner({
  lat,
  lng,
  onChange,
  className,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  className?: string;
}) {
  const position: [number, number] = [lat, lng];

  return (
    <div className={cn("overflow-hidden rounded-lg border", className)}>
      <MapContainer
        center={position}
        zoom={13}
        className="h-full w-full min-h-[280px] z-0"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToPlace onPick={onChange} />
        <RecenterOnChange position={position} />
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
      </MapContainer>
    </div>
  );
}

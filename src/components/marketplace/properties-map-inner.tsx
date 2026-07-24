"use client";

import * as React from "react";
import Link from "next/link";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  ZoomControl,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tx, useI18n } from "@/lib/i18n/client";

export type MapPin = {
  id: string;
  slug: string;
  lat: number;
  lng: number;
  label: string;
  /** Query string (no leading "?") carrying the current search's dates/guests to the listing page. */
  query?: string;
};

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  React.useEffect(() => {
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0]!, 12, { animate: false });
      return;
    }
    const b = L.latLngBounds(positions.map(([la, ln]) => [la, ln] as L.LatLngTuple));
    map.fitBounds(b, { padding: [48, 48], maxZoom: 14, animate: false });
  }, [map, positions]);
  return null;
}

function priceDivIcon(label: string) {
  const safe = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return L.divIcon({
    className: "!border-0 !bg-transparent",
    html: `<div class="whitespace-nowrap rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold text-foreground shadow-md">${safe}</div>`,
    iconSize: [88, 32],
    iconAnchor: [44, 32],
  });
}

function MapResize({ when }: { when: boolean }) {
  const map = useMap();
  React.useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(t);
  }, [when, map]);
  return null;
}

export default function PropertiesMapInner({
  pins,
  className,
}: {
  pins: MapPin[];
  className?: string;
}) {
  const i18n = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  const positions = React.useMemo(
    () => pins.map((p) => [p.lat, p.lng] as [number, number]),
    [pins]
  );
  const center = positions[0] ?? [41.6086, 21.7453];

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm",
        expanded
          ? "fixed inset-0 z-[100] m-0 h-[100dvh] rounded-none border-0"
          : "h-full min-h-[320px] w-full",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="absolute right-3 top-3 z-[1000] flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background shadow-md transition-colors hover:bg-muted"
        aria-label={expanded ? i18n.resolve("map.exit_fullscreen", "Exit full screen map").text : i18n.resolve("map.expand", "Expand map").text}
      >
        {expanded ? (
          <Minimize2 className="h-4 w-4" />
        ) : (
          <Maximize2 className="h-4 w-4" />
        )}
      </button>

      <MapContainer
        center={center}
        zoom={11}
        className="h-full w-full min-h-[inherit] z-0 [&_.leaflet-control-zoom]:border-border [&_.leaflet-control-zoom_a]:bg-background [&_.leaflet-control-zoom_a]:text-foreground"
        scrollWheelZoom
        zoomControl={false}
      >
        <MapResize when={expanded} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomright" />
        <FitBounds positions={positions} />
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.lat, pin.lng]}
            icon={priceDivIcon(pin.label)}
          >
            <Popup>
              <span className="text-sm font-semibold">{pin.label}</span>
              <div className="mt-1">
                <Link
                  href={`/properties/${pin.slug}${pin.query ? `?${pin.query}` : ""}`}
                  className="text-sm text-primary underline underline-offset-2"
                >
                  <Tx k="map.view_listing" source="View listing" />
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

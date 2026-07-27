"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
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
  title: string;
  location: string;
  imageUrl?: string;
  imageAlt?: string;
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

function priceDivIcon(label: string, active: boolean) {
  const safe = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  return L.divIcon({
    className: "!border-0 !bg-transparent",
    html: `<div class="whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold shadow-md transition-[transform,background-color,color,border-color] duration-150 ${
      active
        ? "scale-110 border-foreground bg-foreground text-background"
        : "border-border bg-background text-foreground hover:scale-105 hover:border-foreground hover:bg-foreground hover:text-background"
    }">${safe}</div>`,
    iconSize: [96, 36],
    iconAnchor: [48, 36],
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
  hoveredPinId,
}: {
  pins: MapPin[];
  className?: string;
  hoveredPinId?: string | null;
}) {
  const i18n = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  const [selectedPinId, setSelectedPinId] = React.useState<string | null>(null);
  const [mapHoveredPinId, setMapHoveredPinId] = React.useState<string | null>(null);
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
            icon={priceDivIcon(
              pin.label,
              hoveredPinId === pin.id ||
                mapHoveredPinId === pin.id ||
                selectedPinId === pin.id
            )}
            zIndexOffset={
              hoveredPinId === pin.id ||
              mapHoveredPinId === pin.id ||
              selectedPinId === pin.id
                ? 1000
                : 0
            }
            eventHandlers={{
              click: () => setSelectedPinId(pin.id),
              mouseover: () => setMapHoveredPinId(pin.id),
              mouseout: () => setMapHoveredPinId(null),
              popupclose: () =>
                setSelectedPinId((current) =>
                  current === pin.id ? null : current
                ),
            }}
          >
            <Popup
              className="listing-preview-popup"
              minWidth={280}
              maxWidth={320}
              offset={[0, -8]}
            >
              <Link
                href={`/properties/${pin.slug}${pin.query ? `?${pin.query}` : ""}`}
                className="group block overflow-hidden rounded-2xl bg-background text-foreground"
                aria-label={i18n.resolve("map.view_listing", "View listing").text}
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-muted">
                  {pin.imageUrl ? (
                    <Image
                      src={pin.imageUrl}
                      alt={pin.imageAlt || pin.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      sizes="320px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      <Tx k="property_card.no_photos" source="No photos" />
                    </div>
                  )}
                </div>
                <div className="space-y-1 px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-1 text-sm font-semibold">
                      {pin.location}
                    </p>
                    <span className="notranslate shrink-0 text-sm font-semibold" translate="no">
                      {pin.label}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {pin.title}
                  </p>
                </div>
              </Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

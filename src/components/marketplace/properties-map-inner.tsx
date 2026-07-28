"use client";

import * as React from "react";
import Image from "next/image";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import Supercluster from "supercluster";
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

const MAP_MAX_ZOOM = 18;

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

function clusterDivIcon(count: number, terminal: boolean) {
  return L.divIcon({
    className: "!border-0 !bg-transparent",
    html: `<div class="relative flex h-11 min-w-11 items-center justify-center rounded-full border-2 border-background bg-foreground px-3 text-sm font-bold text-background shadow-lg transition-transform hover:scale-105" title="${count} listings">
      <span>${count}</span>
      <span class="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-background ${
        terminal ? "bg-primary" : "bg-background"
      } text-[10px] ${terminal ? "text-primary-foreground" : "text-foreground"}">+</span>
    </div>`,
    iconSize: [52, 48],
    iconAnchor: [26, 48],
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

type PinPointProperties = {
  pin: MapPin;
};

type PinClusterProperties = Record<string, never>;

function ListingPreview({ pin }: { pin: MapPin }) {
  const i18n = useI18n();

  return (
    <a
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
          <p
            className="notranslate line-clamp-1 text-sm font-semibold"
            translate="no"
          >
            {pin.location}
          </p>
          <span
            className="notranslate shrink-0 text-sm font-semibold"
            translate="no"
          >
            {pin.label}
          </span>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{pin.title}</p>
      </div>
    </a>
  );
}

function GroupedListingPreview({ pins }: { pins: MapPin[] }) {
  const i18n = useI18n();
  const countLabel = i18n.plural(
    "properties.results",
    pins.length,
    "{n} home",
    "{n} homes"
  );

  return (
    <div className="overflow-hidden rounded-2xl bg-background text-foreground">
      <div className="border-b border-border px-4 py-3">
        <p
          className={cn(
            "text-sm font-semibold",
            countLabel.translated && "notranslate"
          )}
        >
          {countLabel.text}
        </p>
        <p
          className="notranslate mt-0.5 line-clamp-1 text-xs text-muted-foreground"
          translate="no"
        >
          {pins[0]?.location}
        </p>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {pins.map((pin) => (
          <a
            key={pin.id}
            href={`/properties/${pin.slug}${pin.query ? `?${pin.query}` : ""}`}
            className="group flex gap-3 border-b border-border/70 p-3 last:border-b-0 hover:bg-muted/50"
            aria-label={i18n.resolve("map.view_listing", "View listing").text}
          >
            <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
              {pin.imageUrl ? (
                <Image
                  src={pin.imageUrl}
                  alt={pin.imageAlt || pin.title}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                  sizes="80px"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium">{pin.title}</p>
              <p
                className="notranslate mt-1 text-sm font-semibold"
                translate="no"
              >
                {pin.label}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function PriceMarker({
  pin,
  active,
  onSelected,
  onHovered,
}: {
  pin: MapPin;
  active: boolean;
  onSelected: (id: string | null) => void;
  onHovered: (id: string | null) => void;
}) {
  return (
    <Marker
      position={[pin.lat, pin.lng]}
      icon={priceDivIcon(pin.label, active)}
      zIndexOffset={active ? 1000 : 0}
      eventHandlers={{
        click: () => onSelected(pin.id),
        mouseover: () => onHovered(pin.id),
        mouseout: () => onHovered(null),
        popupclose: () => onSelected(null),
      }}
    >
      <Popup
        className="listing-preview-popup"
        minWidth={280}
        maxWidth={320}
        offset={[0, -8]}
      >
        <ListingPreview pin={pin} />
      </Popup>
    </Marker>
  );
}

function ClusteredMarkers({
  pins,
  hoveredPinId,
  selectedPinId,
  mapHoveredPinId,
  onSelected,
  onHovered,
}: {
  pins: MapPin[];
  hoveredPinId?: string | null;
  selectedPinId: string | null;
  mapHoveredPinId: string | null;
  onSelected: (id: string | null) => void;
  onHovered: (id: string | null) => void;
}) {
  const map = useMap();
  const [viewport, setViewport] = React.useState(() => {
    const bounds = map.getBounds();
    return {
      bounds: [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ] as [number, number, number, number],
      zoom: map.getZoom(),
    };
  });

  const updateViewport = React.useCallback(() => {
    const bounds = map.getBounds();
    setViewport({
      bounds: [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ],
      zoom: map.getZoom(),
    });
  }, [map]);

  useMapEvents({
    moveend: updateViewport,
    zoomend: updateViewport,
  });

  const index = React.useMemo(() => {
    const points: Supercluster.PointFeature<PinPointProperties>[] = pins.map(
      (pin) => ({
        type: "Feature",
        properties: { pin },
        geometry: {
          type: "Point",
          coordinates: [pin.lng, pin.lat],
        },
      })
    );

    return new Supercluster<PinPointProperties, PinClusterProperties>({
      radius: 58,
      maxZoom: MAP_MAX_ZOOM,
      minPoints: 2,
    }).load(points);
  }, [pins]);

  const clusters = React.useMemo(
    () =>
      index.getClusters(
        viewport.bounds,
        Math.min(MAP_MAX_ZOOM, Math.round(viewport.zoom))
      ),
    [index, viewport]
  );

  return clusters.map((feature) => {
    const [lng, lat] = feature.geometry.coordinates;
    if ("cluster" in feature.properties) {
      const {
        cluster_id: clusterId,
        point_count: count,
      } = feature.properties;
      const expansionZoom = index.getClusterExpansionZoom(clusterId);
      const terminal =
        viewport.zoom >= MAP_MAX_ZOOM || expansionZoom > MAP_MAX_ZOOM;
      const groupedPins = terminal
        ? index
            .getLeaves(clusterId, 50)
            .map((leaf) => leaf.properties.pin)
        : [];

      return (
        <Marker
          key={`cluster-${clusterId}`}
          position={[lat, lng]}
          icon={clusterDivIcon(count, terminal)}
          zIndexOffset={500 + count}
          eventHandlers={
            terminal
              ? undefined
              : {
                  click: () => {
                    map.closePopup();
                    map.setView(
                      [lat, lng],
                      Math.min(MAP_MAX_ZOOM, expansionZoom),
                      { animate: true }
                    );
                  },
                }
          }
        >
          {terminal ? (
            <Popup
              className="listing-preview-popup"
              minWidth={300}
              maxWidth={360}
              offset={[0, -8]}
            >
              <GroupedListingPreview pins={groupedPins} />
            </Popup>
          ) : null}
        </Marker>
      );
    }

    const pin = feature.properties.pin;
    const active =
      hoveredPinId === pin.id ||
      mapHoveredPinId === pin.id ||
      selectedPinId === pin.id;

    return (
      <PriceMarker
        key={pin.id}
        pin={pin}
        active={active}
        onSelected={onSelected}
        onHovered={onHovered}
      />
    );
  });
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
        maxZoom={MAP_MAX_ZOOM}
      >
        <MapResize when={expanded} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomright" />
        <FitBounds positions={positions} />
        <ClusteredMarkers
          pins={pins}
          hoveredPinId={hoveredPinId}
          selectedPinId={selectedPinId}
          mapHoveredPinId={mapHoveredPinId}
          onSelected={setSelectedPinId}
          onHovered={setMapHoveredPinId}
        />
      </MapContainer>
    </div>
  );
}

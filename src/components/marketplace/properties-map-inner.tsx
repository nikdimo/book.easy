"use client";

import * as React from "react";
import Image from "next/image";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  ZoomControl,
  ScaleControl,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import Supercluster from "supercluster";
import "leaflet/dist/leaflet.css";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tx, useI18n } from "@/lib/i18n/client";
import type { MapBounds } from "@/lib/map-bounds";

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

/** How long the map has to sit still before its viewport is pushed to the search. */
const VIEWPORT_SETTLE_MS = 500;

/**
 * Runs `apply` once, as soon as the map container actually has a size.
 *
 * Measure the DOM, not map.getSize(): if the map was created while the container
 * was unsized, Leaflet caches 0x0 and keeps returning it until something calls
 * invalidateSize(). On a slow first paint fitBounds would then clamp to maxZoom
 * at the wrong centre and, since we position the map only once, it would stay
 * there.
 *
 * Retries on a timer rather than waiting for a resize event: `resize` only comes
 * from invalidateSize(), which MapResize drives off a ResizeObserver — and
 * ResizeObserver, like requestAnimationFrame, never fires while the tab is in
 * the background. setTimeout does.
 */
function runWhenSized(map: L.Map, apply: () => void) {
  let done = false;

  const attempt = () => {
    if (done) return true;
    const container = map.getContainer();
    if (container.clientWidth < 2 || container.clientHeight < 2) return false;
    done = true;
    map.invalidateSize({ pan: false, animate: false });
    apply();
    return true;
  };

  if (attempt()) return () => {};

  let attempts = 0;
  let timer = window.setTimeout(function retry() {
    if (attempt() || (attempts += 1) > 20) return;
    timer = window.setTimeout(retry, 100);
  }, 0);
  return () => window.clearTimeout(timer);
}

function toLatLngBounds(bounds: MapBounds) {
  // A rectangle dragged across the antimeridian comes back with west > east;
  // Leaflet is happy with a longitude past 180 and wraps it for us.
  const east = bounds.east < bounds.west ? bounds.east + 360 : bounds.east;
  return L.latLngBounds(
    [bounds.south, bounds.west],
    [bounds.north, east]
  );
}

export function boundsCenter(bounds: MapBounds): [number, number] {
  const east = bounds.east < bounds.west ? bounds.east + 360 : bounds.east;
  return [(bounds.south + bounds.north) / 2, (bounds.west + east) / 2];
}

/**
 * Content signature for a pin set. `pins` is rebuilt by the server component, so
 * a fresh RSC payload hands us an array with the same coordinates but a new
 * identity. Keying the fit on coordinates instead of identity keeps a re-render
 * from yanking the map back out from under the user.
 */
function positionsKey(positions: [number, number][]) {
  return positions
    .map(([la, ln]) => `${la.toFixed(5)},${ln.toFixed(5)}`)
    .sort()
    .join("|");
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const key = positionsKey(positions);
  const fittedKey = React.useRef<string | null>(null);

  // Layout effect so the fit lands before ClusteredMarkers' passive effect reads
  // the bounds, regardless of where either sits in the JSX.
  React.useLayoutEffect(() => {
    if (positions.length === 0) return;
    // Same listings as the last fit — the current view is the user's to keep.
    if (fittedKey.current === key) return;

    return runWhenSized(map, () => {
      fittedKey.current = key;

      if (positions.length === 1) {
        map.setView(positions[0]!, 12, { animate: false });
      } else {
        const b = L.latLngBounds(
          positions.map(([la, ln]) => [la, ln] as L.LatLngTuple)
        );
        map.fitBounds(b, { padding: [48, 48], maxZoom: 14, animate: false });
      }
    });
    // `positions` is intentionally not a dep: `key` is its content signature.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/**
 * Restores the viewport the URL was written with, so a shared or reloaded link
 * shows the same rectangle the results were filtered by. Applied once — later
 * URL updates come *from* the map and must not be echoed back into it.
 */
function ViewFromBounds({ bounds }: { bounds: MapBounds }) {
  const map = useMap();
  const applied = React.useRef(false);

  React.useLayoutEffect(() => {
    if (applied.current) return;
    return runWhenSized(map, () => {
      applied.current = true;
      map.fitBounds(toLatLngBounds(bounds), { animate: false });
    });
  }, [map, bounds]);

  return null;
}

/**
 * Pushes the visible rectangle to the search once the map settles.
 *
 * Only viewport changes the user caused are reported: the initial fit-to-pins is
 * the app positioning itself, and echoing that back into the URL would re-filter
 * the very results the fit was computed from — each pass cropping a little more
 * off the edges. Interaction is detected on the container rather than through
 * Leaflet's move events, which can't tell a drag from a setView().
 */
function ReportViewport({
  onChange,
}: {
  onChange: (bounds: MapBounds) => void;
}) {
  const map = useMap();
  const onChangeRef = React.useRef(onChange);

  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    const container = map.getContainer();
    let interacted = false;
    let timer = 0;

    const markInteracted = () => {
      interacted = true;
    };
    container.addEventListener("pointerdown", markInteracted, true);
    container.addEventListener("wheel", markInteracted, {
      capture: true,
      passive: true,
    });
    container.addEventListener("keydown", markInteracted, true);

    const settle = () => {
      if (!interacted) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const b = map.getBounds();
        onChangeRef.current({
          west: b.getWest(),
          south: b.getSouth(),
          east: b.getEast(),
          north: b.getNorth(),
        });
      }, VIEWPORT_SETTLE_MS);
    };
    map.on("moveend zoomend", settle);

    return () => {
      window.clearTimeout(timer);
      map.off("moveend zoomend", settle);
      container.removeEventListener("pointerdown", markInteracted, true);
      container.removeEventListener("wheel", markInteracted, true);
      container.removeEventListener("keydown", markInteracted, true);
    };
  }, [map]);

  return null;
}

function priceDivIcon(label: string, active: boolean) {
  const safe = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
  // Let Leaflet reserve approximately the same width as the rendered label. A fixed
  // 96px box made short prices look padded and still was not reliable for longer
  // currency formats.
  const width = Math.max(70, Math.min(180, label.length * 9 + 24));
  return L.divIcon({
    className: "!border-0 !bg-transparent",
    html: `<div class="whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold shadow-md transition-[transform,background-color,color,border-color] duration-150 ${
      active
        ? "scale-110 border-foreground bg-foreground text-background"
        : "border-border bg-background text-foreground hover:scale-105 hover:border-foreground hover:bg-foreground hover:text-background"
    }">${safe}</div>`,
    iconSize: [width, 36],
    iconAnchor: [width / 2, 36],
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

/**
 * Leaflet's keyboard handler focuses the map container on mousedown, then tries
 * to undo the scroll that focus causes with `window.scrollTo(...)`. That only
 * works when the page itself is the scroller. Here the map lives inside an
 * `overflow-y-auto` panel, so the compensation misses and the panel jumps
 * mid-click: mousedown and mouseup land on different elements, Leaflet never
 * registers the marker click, and the first click on a cluster appears to do
 * nothing (every click after works, because Leaflet skips a focused container).
 *
 * Focus it ourselves on pointerdown — which precedes mousedown — without
 * scrolling. Leaflet then sees an already-focused container and does nothing.
 */
function KeepFocusFromScrolling() {
  const map = useMap();
  React.useEffect(() => {
    const container = map.getContainer();
    const onPointerDown = () => {
      if (document.activeElement !== container) {
        container.focus({ preventScroll: true });
      }
    };
    container.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      container.removeEventListener("pointerdown", onPointerDown, true);
  }, [map]);
  return null;
}

function MapResize() {
  const map = useMap();
  React.useEffect(() => {
    const container = map.getContainer();
    const syncSize = () => {
      const size = map.getSize();
      if (
        container.clientWidth !== size.x ||
        container.clientHeight !== size.y
      ) {
        map.invalidateSize();
      }
    };

    // ResizeObserver reacts precisely to fullscreen toggles and layout shifts,
    // but it is delivered on the rendering lifecycle and so never fires while
    // the tab is backgrounded. Pair it with a timer-based catch-up, which does
    // run there, so a map opened in a background tab is still sized correctly.
    const observer = new ResizeObserver(syncSize);
    observer.observe(container);
    const initial = window.setTimeout(syncSize, 150);
    window.addEventListener("resize", syncSize);

    return () => {
      observer.disconnect();
      window.clearTimeout(initial);
      window.removeEventListener("resize", syncSize);
    };
  }, [map]);
  return null;
}

type PinPointProperties = {
  pin: MapPin;
};

type PinClusterProperties = Record<string, never>;

type PinClusterIndex = Supercluster<
  PinPointProperties,
  PinClusterProperties
>;

function getClusterTargetZoom(index: PinClusterIndex, rootClusterId: number) {
  let targetZoom = index.getClusterExpansionZoom(rootClusterId);
  const pendingClusterIds = [rootClusterId];

  while (pendingClusterIds.length > 0 && targetZoom <= MAP_MAX_ZOOM) {
    const clusterId = pendingClusterIds.pop()!;
    for (const child of index.getChildren(clusterId)) {
      if (!("cluster" in child.properties)) continue;

      const childClusterId = child.properties.cluster_id;
      targetZoom = Math.max(
        targetZoom,
        index.getClusterExpansionZoom(childClusterId)
      );
      pendingClusterIds.push(childClusterId);
    }
  }

  return Math.min(MAP_MAX_ZOOM, targetZoom);
}

/**
 * The Leaflet map is an external mutable store, so subscribe to it rather than
 * mirroring it into state. This matters for the very first paint: the initial
 * fit happens in FitBounds' layout effect, which runs *after* this component
 * renders but *before* React subscribes here — so the fit's moveend/zoomend
 * never reach a listener. useSyncExternalStore re-reads the snapshot when it
 * subscribes and catches that change, with no event, timer, or animation frame
 * to race against (a requestAnimationFrame would never fire in a background
 * tab, stranding the map on its pre-fit viewport).
 *
 * The snapshot is a string so React's Object.is check stays stable, and it is
 * cached rather than read live: React re-reads the snapshot after every render,
 * so sampling the map directly would hand back a different value on each render
 * while the map is mid-animation (a popup's autoPan is enough) and re-render
 * forever. The cache only advances when a subscribed event says the map settled.
 */
function useMapViewport(map: L.Map) {
  const cached = React.useRef<string | null>(null);

  const read = React.useCallback(() => {
    const b = map.getBounds();
    return `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()},${map.getZoom()}`;
  }, [map]);

  const subscribe = React.useCallback(
    (onChange: () => void) => {
      // The initial fit ran in FitBounds' layout effect, before this
      // subscription existed. Refresh once here; React re-reads the snapshot
      // right after subscribing and picks the new value up.
      cached.current = read();

      const handleChange = () => {
        const next = read();
        if (next === cached.current) return;
        cached.current = next;
        onChange();
      };

      map.on("moveend zoomend resize", handleChange);
      return () => {
        map.off("moveend zoomend resize", handleChange);
      };
    },
    [map, read]
  );

  const getSnapshot = React.useCallback(() => {
    cached.current ??= read();
    return cached.current;
  }, [read]);

  const snapshot = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => "0,0,0,0,0"
  );

  return React.useMemo(() => {
    const [west, south, east, north, zoom] = snapshot.split(",").map(Number);
    return {
      bounds: [west, south, east, north] as [number, number, number, number],
      zoom: zoom!,
    };
  }, [snapshot]);
}

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
  const viewport = useMapViewport(map);

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
      const targetZoom = getClusterTargetZoom(index, clusterId);
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
                    // No map.stop() here: Leaflet's stop() calls setZoom() ->
                    // setView(), which fires a synchronous moveend and forces a
                    // re-render mid-click. flyTo() already cancels any in-flight
                    // animation itself.
                    map.flyTo([lat, lng], targetZoom, {
                      animate: true,
                      duration: 0.65,
                    });
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
  initialBounds,
  onBoundsChange,
  expandable = true,
}: {
  pins: MapPin[];
  className?: string;
  hoveredPinId?: string | null;
  /** Viewport carried in the URL on first load; ignored on later renders. */
  initialBounds?: MapBounds | null;
  onBoundsChange?: (bounds: MapBounds) => void;
  /** Off where the map is already sized to the screen and the corner is wanted for
   *  something else — full screen would be a no-op there anyway. */
  expandable?: boolean;
}) {
  const i18n = useI18n();
  const [expanded, setExpanded] = React.useState(false);
  const [selectedPinId, setSelectedPinId] = React.useState<string | null>(null);
  const [mapHoveredPinId, setMapHoveredPinId] = React.useState<string | null>(null);
  // Every reported move rewrites the URL and hands back a new `initialBounds`.
  // Freeze the one we mounted with so restoring the view stays a one-off.
  const [mountBounds] = React.useState<MapBounds | null>(
    () => initialBounds ?? null
  );
  // Once the user has taken the wheel, the map is theirs: no auto-fit may move
  // it again, not even when a narrowed search returns a smaller set of pins.
  const [userMoved, setUserMoved] = React.useState(false);
  const positions = React.useMemo(
    () => pins.map((p) => [p.lat, p.lng] as [number, number]),
    [pins]
  );
  const center = mountBounds
    ? boundsCenter(mountBounds)
    : positions[0] ?? [41.6086, 21.7453];

  const handleBoundsChange = React.useCallback(
    (bounds: MapBounds) => {
      setUserMoved(true);
      onBoundsChange?.(bounds);
    },
    [onBoundsChange]
  );

  React.useEffect(() => {
    if (!expanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-border bg-muted/30 shadow-sm",
        // `className` sits *after* the resting size so a caller that states its own
        // height gets it. It used to come first, which meant `h-full` silently won and
        // any height passed in was discarded — a caller whose parent had no height then
        // collapsed to `min-h-[320px]`. Callers that size the map from a parent still
        // pass `h-full` themselves, so nothing changes for them.
        !expanded && "h-full min-h-[320px] w-full",
        className,
        // Full screen is not the caller's call to make, so it wins over both.
        expanded &&
          "fixed inset-0 z-[100] m-0 h-[100dvh] min-h-0 w-screen max-w-none rounded-none border-0"
      )}
    >
      {expandable && (
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
      )}

      <MapContainer
        center={center}
        zoom={11}
        className="h-full w-full min-h-[inherit] z-0 [&_.leaflet-control-zoom]:border-border [&_.leaflet-control-zoom_a]:bg-background [&_.leaflet-control-zoom_a]:text-foreground"
        scrollWheelZoom
        zoomControl={false}
        maxZoom={MAP_MAX_ZOOM}
      >
        <KeepFocusFromScrolling />
        <MapResize />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomright" />
        <ScaleControl position="bottomleft" imperial={false} maxWidth={120} />
        {mountBounds ? <ViewFromBounds bounds={mountBounds} /> : null}
        {!mountBounds && !userMoved ? (
          <FitBounds positions={positions} />
        ) : null}
        <ReportViewport onChange={handleBoundsChange} />
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

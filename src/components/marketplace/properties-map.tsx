"use client";

import dynamic from "next/dynamic";
import type { MapPin } from "./properties-map-inner";
import type { MapBounds } from "@/lib/map-bounds";

const PropertiesMapInner = dynamic(() => import("./properties-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[320px] w-full animate-pulse rounded-2xl bg-muted" />
  ),
});

export type { MapPin };

export function PropertiesMap({
  pins,
  className,
  hoveredPinId,
  initialBounds,
  onBoundsChange,
  expandable,
  expanded,
  onExpandedChange,
  pinPopups,
  selectedPinId,
  onSelectedPinChange,
}: {
  pins: MapPin[];
  className?: string;
  hoveredPinId?: string | null;
  initialBounds?: MapBounds | null;
  onBoundsChange?: (bounds: MapBounds) => void;
  expandable?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  pinPopups?: boolean;
  selectedPinId?: string | null;
  onSelectedPinChange?: (id: string | null) => void;
}) {
  return (
    <PropertiesMapInner
      pins={pins}
      className={className}
      hoveredPinId={hoveredPinId}
      initialBounds={initialBounds}
      onBoundsChange={onBoundsChange}
      expandable={expandable}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      pinPopups={pinPopups}
      selectedPinId={selectedPinId}
      onSelectedPinChange={onSelectedPinChange}
    />
  );
}

"use client";

import dynamic from "next/dynamic";
import type { MapPin } from "./properties-map-inner";

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
}: {
  pins: MapPin[];
  className?: string;
  hoveredPinId?: string | null;
}) {
  return (
    <PropertiesMapInner
      pins={pins}
      className={className}
      hoveredPinId={hoveredPinId}
    />
  );
}

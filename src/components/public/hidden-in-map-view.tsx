"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useActiveHomeListingsView } from "@/components/public/home-listings-view-store";

/**
 * Takes a section off the home page while the map view is showing.
 *
 * The map is sized to fill the screen below the header, so anything that would sit
 * above it — the hero, the "Popular homes" carousel — has to stand down or the map is
 * pushed out of view and the height it was given stops being true.
 *
 * Hidden with `display: none` rather than unmounted: the hero's background photo is a
 * `priority` image, and dropping it from the tree means paying for it again every time
 * someone flips back to the grid. `display: contents` the rest of the time, so the
 * wrapper stays out of the way of its child's own margins — the hero pulls itself up
 * under the header with a negative one.
 *
 * The server always renders the children visible, so the markup React hydrates
 * matches; map view lands on the commit right after.
 */
export function HiddenInMapView({ children }: { children: ReactNode }) {
  const view = useActiveHomeListingsView();
  return (
    <div className={cn("contents", view === "map" && "hidden")}>{children}</div>
  );
}

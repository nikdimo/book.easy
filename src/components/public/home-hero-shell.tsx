"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useActiveHomeListingsView } from "@/components/public/home-listings-view-store";

/**
 * Wraps the home hero so map view can take the top of the page for itself.
 *
 * Hidden with `display: none` rather than unmounted: the hero's background photo is a
 * `priority` image, and dropping it from the tree means paying for it again every time
 * someone flips back to the grid. `display: contents` the rest of the time, so the
 * wrapper stays out of the way of the hero's own negative top margin.
 *
 * The server always renders it visible, so the markup React hydrates matches; map view
 * lands on the commit right after.
 */
export function HomeHeroShell({ children }: { children: ReactNode }) {
  const view = useActiveHomeListingsView();
  return (
    <div className={cn("contents", view === "map" && "hidden")}>{children}</div>
  );
}

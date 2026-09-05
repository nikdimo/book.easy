"use client";

import { useSyncExternalStore } from "react";
import { readStoredValue, writeStoredValue } from "@/lib/browser-storage";

/**
 * How large the thumbnails are, remembered across sessions.
 *
 * Read as an external store rather than state seeded in an effect: the server has no
 * `localStorage`, so the choice cannot be known during the first render, and
 * `useSyncExternalStore` renders the server snapshot through hydration then swaps to the
 * stored one — which an effect-and-setState pair only imitates at the cost of a second
 * render pass and a visible reflow of the whole grid.
 */
export type Density = "small" | "medium" | "large";

const KEY = "host-editor-photo-density";

let cached: Density | null = null;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): Density {
  // Guarded, because this runs inside a `useSyncExternalStore` snapshot — that is,
  // during render — and a browser that refuses storage throws on the access itself,
  // which would take the whole photos workspace down over a thumbnail size. See
  // `lib/browser-storage.ts`.
  if (cached === null) {
    const stored = readStoredValue(KEY);
    cached = stored === "small" || stored === "large" ? stored : "medium";
  }
  return cached;
}

function getServerSnapshot(): Density {
  return "medium";
}

export function useDensity(): Density {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function setDensity(next: Density) {
  cached = next;
  // The grid resizes from the in-memory cache either way; only the memory of the choice
  // depends on the write landing.
  writeStoredValue(KEY, next);
  listeners.forEach((listener) => listener());
}

/**
 * Column counts per density.
 *
 * Phones stay at three regardless: the control is a desktop affordance, and one-across
 * photos on a 375px screen would turn organising forty of them into a scrolling marathon.
 * By room runs one step denser than All photos, because its job is seeing several rooms
 * at once rather than inspecting a single shot.
 */
export const GRID_CLASS: Record<Density, string> = {
  small:
    "grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-10",
  medium: "grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
  large: "grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4",
};

export const ROOM_GRID_CLASS: Record<Density, string> = {
  small:
    "grid-cols-3 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12",
  medium: "grid-cols-3 sm:grid-cols-5 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8",
  large: "grid-cols-2 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5",
};

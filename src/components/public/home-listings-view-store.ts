"use client";

import { useSyncExternalStore } from "react";

export type HomeListingsViewMode = "compact" | "detailed" | "map";

/** Survives navigation and reloads so the choice reads as a preference rather than a
 * per-visit toggle. Deliberately not in the URL: the home page has no other query
 * state and a shared link shouldn't carry someone else's layout taste. */
const STORAGE_KEY = "home:listings-view";

export function isViewMode(
  value: string | null,
  mapAvailable: boolean,
): value is HomeListingsViewMode {
  if (value === "compact" || value === "detailed") return true;
  return mapAvailable && value === "map";
}

/** `storage` events only reach *other* tabs, so a same-tab write has to notify
 * subscribers itself. */
const storedListeners = new Set<() => void>();

export function subscribeToStoredView(onChange: () => void) {
  storedListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    storedListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Returns a plain string, so React's identity check over successive snapshots is
 * stable without any caching of our own. Storage can be unavailable (private mode,
 * blocked cookies) — then there is simply no stored preference. */
export function readStoredView(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredView(mode: HomeListingsViewMode) {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Preference just won't persist; notifying below still switches the view.
  }
  for (const listener of storedListeners) listener();
}

/**
 * The view that is actually on screen, as opposed to the one in storage.
 *
 * They differ: a stored "map" falls back to the grid when the page has no pins to
 * put on one, and only `HomeListingsView` knows that. So it publishes the resolved
 * mode here and the rest of the page — the hero, the floating search — reacts to
 * that rather than re-deriving it from storage and getting it wrong.
 */
let activeView: HomeListingsViewMode = "compact";
const activeListeners = new Set<() => void>();

export function setActiveHomeListingsView(mode: HomeListingsViewMode) {
  if (activeView === mode) return;
  activeView = mode;
  for (const listener of activeListeners) listener();
}

function subscribeActiveView(onChange: () => void) {
  activeListeners.add(onChange);
  return () => {
    activeListeners.delete(onChange);
  };
}

function getActiveView(): HomeListingsViewMode {
  return activeView;
}

/** The server has no idea which view is stored, so it always renders the page as it
 * looks in the grid views — hero present. Map view lands on the commit right after
 * hydration, exactly like the switcher itself. */
function getServerActiveView(): HomeListingsViewMode {
  return "compact";
}

export function useActiveHomeListingsView(): HomeListingsViewMode {
  return useSyncExternalStore(
    subscribeActiveView,
    getActiveView,
    getServerActiveView,
  );
}

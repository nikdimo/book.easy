"use client";

import { useEffect, useState } from "react";

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Reveals photo indices for background preloading a few at a time, starting
 * right after `initialBatch` (already loaded eagerly by the caller) — so the
 * first photos are cached instantly and the rest fill in first-to-last
 * without competing on the network with whichever photo is on screen.
 *
 * Pass `enabled: false` to hold at `initialBatch` until some condition is met
 * (e.g. don't bother warming a whole gallery's photos until the user has
 * shown interest by swiping past the first one) — useful when many of these
 * run at once, like one per card in a listings grid.
 */
export function useProgressivePreload(total: number, initialBatch = 3, enabled = true): number {
  const [loadedUpTo, setLoadedUpTo] = useState(Math.min(initialBatch, total));

  useEffect(() => {
    if (!enabled || loadedUpTo >= total) return;

    const win = window as IdleWindow;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (win.requestIdleCallback) {
      idleId = win.requestIdleCallback(() => setLoadedUpTo((n) => Math.min(n + 1, total)), {
        timeout: 500,
      });
    } else {
      timeoutId = setTimeout(() => setLoadedUpTo((n) => Math.min(n + 1, total)), 150);
    }

    return () => {
      if (idleId !== undefined) win.cancelIdleCallback?.(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [loadedUpTo, total, enabled]);

  return loadedUpTo;
}

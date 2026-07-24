"use client";

import { useEffect } from "react";

/** A view only counts once the visitor has stayed long enough to have actually looked
 *  at the page — this filters out back-button bounces and link prefetches that render
 *  and immediately unmount. */
const DWELL_MS = 4000;

/**
 * Fires a single "this listing was viewed" ping for popularity scoring. Renders
 * nothing. Failures are swallowed: an analytics signal is never worth interrupting a
 * guest's browsing over, and the server dedupes repeat pings per visitor per day
 * anyway, so a lost or duplicated request costs nothing.
 *
 * The dwell timer only runs while the tab is actually in the foreground, so a listing
 * opened into a background tab counts when the guest gets to it — not when it loaded,
 * and not at all if they close it unread.
 */
export function ListingViewTracker({ listingId }: { listingId: string }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const send = () => {
      void fetch(`/api/listings/${listingId}/view`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
      stop();
    };

    const start = () => {
      if (timer === undefined) timer = setTimeout(send, DWELL_MS);
    };

    const pause = () => {
      // Restart the dwell rather than resume it — a tab glanced at for a second at a
      // time isn't the same as one read for four.
      clearTimeout(timer);
      timer = undefined;
    };

    function stop() {
      pause();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") start();
      else pause();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    if (document.visibilityState === "visible") start();

    return stop;
  }, [listingId]);

  return null;
}

"use client";

import * as React from "react";
import { ImageOff, Loader2 } from "lucide-react";

type Status = "checking" | "available" | "unavailable";

/**
 * Shows a Street View frame at the given coordinates so a host can visually confirm
 * the pin lands on the right building — a much faster sanity check than re-reading a
 * lat/lng readout, especially useful where postal addresses are unreliable (see
 * ListingLocationField). Checks coverage first via /api/location/streetview (free —
 * Street View's metadata endpoint isn't billed) so a spot with no imagery — common in
 * rural areas — renders a plain note instead of Google's broken-looking default view.
 *
 * Renders nothing at all if NEXT_PUBLIC_GOOGLE_MAPS_API_KEY isn't configured, same as
 * the Geoapify map tiles falling back silently in listing-location-picker-inner.tsx.
 *
 * The caller should key this component by (rounded) coordinates — see
 * ListingLocationField — so a new pin position remounts it and its "checking" status
 * resets naturally via the initial useState below, rather than this effect needing to
 * reset it itself (React's rules-of-hooks lint flags synchronous setState in an effect
 * body as a cascading-render risk).
 */
export function StreetViewPreview({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const [status, setStatus] = React.useState<Status>("checking");

  React.useEffect(() => {
    if (!key) return;

    let cancelled = false;

    // Debounced: a host fine-tuning the pin by dragging fires several coordinate
    // updates in quick succession, and each one would otherwise trigger its own check.
    const timeout = window.setTimeout(() => {
      void fetch("/api/location/streetview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude, longitude }),
      })
        .then(async (response) => {
          if (!response.ok) return { available: false };
          return (await response.json()) as { available?: boolean };
        })
        .then((payload) => {
          if (!cancelled) setStatus(payload.available ? "available" : "unavailable");
        })
        .catch(() => {
          if (!cancelled) setStatus("unavailable");
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [key, latitude, longitude]);

  if (!key) return null;

  // notranslate: this text swaps between three different states as `status` resolves,
  // and Google Translate's live DOM translation mutates rendered text outside React's
  // control — when React later tries to update a subtree Translate already touched, it
  // throws (e.g. "insertBefore: not a child of this node"). See t.tsx and the same
  // class used throughout the public marketplace pages for this exact reason.
  if (status === "checking") {
    return (
      <div className="notranslate flex h-40 w-full items-center justify-center gap-2 rounded-lg border bg-muted/40 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking for a street view photo…
      </div>
    );
  }

  if (status === "unavailable") {
    return (
      <div className="notranslate flex h-16 w-full items-center gap-2 rounded-lg border border-dashed px-3 text-xs text-muted-foreground">
        <ImageOff className="h-3.5 w-3.5 shrink-0" />
        No street view photo is available for this exact spot.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <iframe
        title="Street view near this pin"
        className="h-52 w-full"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        src={`https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(key)}&location=${latitude},${longitude}`}
      />
    </div>
  );
}

"use client";

import * as React from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { loadGoogleMaps } from "@/lib/google-maps-browser";
import { streetViewPanoId } from "@/lib/utils/street-view-response";

type StreetViewPov = { heading: number; pitch: number };
type MapsListener = { remove(): void };
type StreetViewPanorama = {
  getPano(): string;
  getPov(): StreetViewPov;
  addListener(
    event: "pano_changed" | "pov_changed",
    handler: () => void
  ): MapsListener;
};
type StreetViewPanoramaData = {
  location?: { pano?: string };
};
type MapsApi = {
  StreetViewPanorama: new (
    container: HTMLElement,
    options: {
      pano: string;
      pov: StreetViewPov;
      visible: boolean;
      addressControl?: boolean;
      fullscreenControl?: boolean;
    }
  ) => StreetViewPanorama;
  StreetViewService: new () => {
    getPanorama(
      request:
        | { pano: string }
        | { location: { lat: number; lng: number }; radius: number },
      callback: (response: StreetViewPanoramaData | null, status: string) => void
    ): void;
  };
  StreetViewStatus: { OK: string };
};

export type StreetViewSelection = {
  heading: number;
  pitch: number;
  panoId: string;
};

export function StreetViewPicker({
  latitude,
  longitude,
  initialSelection,
  onUseView,
  compact = false,
  readOnly = false,
  fill = false,
}: {
  latitude: number;
  longitude: number;
  initialSelection?: StreetViewSelection | null;
  onUseView?: (selection: StreetViewSelection) => void;
  compact?: boolean;
  readOnly?: boolean;
  fill?: boolean;
}) {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_JAVASCRIPT_API_KEY?.trim();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panoramaRef = React.useRef<StreetViewPanorama | null>(null);
  const listenersRef = React.useRef<MapsListener[]>([]);
  const onUseViewRef = React.useRef(onUseView);
  const initialSelectionRef = React.useRef(initialSelection);
  const [maps, setMaps] = React.useState<MapsApi | null>(null);
  const [status, setStatus] = React.useState<
    "loading" | "ready" | "unavailable" | "error"
  >("loading");

  React.useEffect(() => {
    onUseViewRef.current = onUseView;
  }, [onUseView]);

  React.useEffect(() => {
    if (!key) return;
    let cancelled = false;

    void loadGoogleMaps(key)
      .then((loadedMaps) => {
        if (!cancelled) setMaps(loadedMaps as unknown as MapsApi);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  React.useEffect(() => {
    if (!maps || !containerRef.current) return;

    let cancelled = false;
    const service = new maps.StreetViewService();
    const initial = initialSelectionRef.current;
    const request = initial?.panoId
      ? { pano: initial.panoId }
      : { location: { lat: latitude, lng: longitude }, radius: 75 };

    service.getPanorama(request, (response, responseStatus) => {
      if (cancelled) return;
      const panoId = streetViewPanoId(response);
      if (responseStatus !== maps.StreetViewStatus.OK || !panoId) {
        setStatus("unavailable");
        return;
      }

      panoramaRef.current = new maps.StreetViewPanorama(
        containerRef.current!,
        {
          pano: panoId,
          pov: initial
            ? {
                heading: initial.heading,
                pitch: initial.pitch,
              }
            : { heading: 0, pitch: 0 },
          visible: true,
          addressControl: false,
          fullscreenControl: true,
        }
      );
      const syncSelection = () => {
        const panorama = panoramaRef.current;
        if (!panorama || readOnly) return;
        const pov = panorama.getPov();
        const currentPanoId = panorama.getPano();
        if (
          !currentPanoId ||
          !Number.isFinite(pov.heading) ||
          !Number.isFinite(pov.pitch)
        ) {
          return;
        }
        onUseViewRef.current?.({
          panoId: currentPanoId,
          heading: Math.round(pov.heading * 100) / 100,
          pitch: Math.round(pov.pitch * 100) / 100,
        });
      };
      listenersRef.current = [
        panoramaRef.current.addListener("pano_changed", syncSelection),
        panoramaRef.current.addListener("pov_changed", syncSelection),
      ];
      setStatus("ready");
      syncSelection();
    });

    return () => {
      cancelled = true;
      for (const listener of listenersRef.current) listener.remove();
      listenersRef.current = [];
      panoramaRef.current = null;
    };
  }, [latitude, longitude, maps, readOnly]);

  if (!key) {
    return (
      <p className="text-sm text-muted-foreground">
        The interactive Street View picker isn&apos;t configured.
      </p>
    );
  }

  return (
    <div
      className={
        fill ? "h-full" : compact ? "space-y-2" : "space-y-4"
      }
    >
      {!compact && (
        <p className="text-sm text-muted-foreground">
          Turn the view and move along the street until guests can clearly recognize
          the property. Your selected view is saved automatically.
        </p>
      )}
      <div
        className={
          fill
            ? "relative h-full overflow-hidden bg-muted"
            : "relative overflow-hidden rounded-xl border bg-muted"
        }
      >
        <div
          ref={containerRef}
          className={
            fill
              ? "h-full w-full"
              : compact
              ? "aspect-[4/3] w-full"
              : "h-[min(52vh,520px)] min-h-72 w-full"
          }
        />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading Street View…
          </div>
        )}
        {status === "unavailable" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <ImageOff className="h-5 w-5" />
            No Street View panorama is available near this location.
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-destructive">
            Street View couldn&apos;t load. Check the API and website restrictions
            for this key.
          </div>
        )}
      </div>
    </div>
  );
}

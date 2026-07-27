"use client";

import * as React from "react";
import { Check, ImageOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadGoogleMaps } from "@/lib/google-maps-browser";

type StreetViewPov = { heading: number; pitch: number };
type StreetViewPanorama = {
  getPano(): string;
  getPov(): StreetViewPov;
};
type StreetViewResponse = {
  data?: { location?: { pano?: string } };
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
      callback: (response: StreetViewResponse | null, status: string) => void
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
}: {
  latitude: number;
  longitude: number;
  initialSelection?: StreetViewSelection | null;
  onUseView: (selection: StreetViewSelection) => void;
}) {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_JAVASCRIPT_API_KEY?.trim();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panoramaRef = React.useRef<StreetViewPanorama | null>(null);
  const [maps, setMaps] = React.useState<MapsApi | null>(null);
  const [status, setStatus] = React.useState<
    "loading" | "ready" | "unavailable" | "error"
  >("loading");
  const [saved, setSaved] = React.useState(Boolean(initialSelection));

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
    const request = initialSelection?.panoId
      ? { pano: initialSelection.panoId }
      : { location: { lat: latitude, lng: longitude }, radius: 75 };

    service.getPanorama(request, (response, responseStatus) => {
      if (cancelled) return;
      const panoId = response?.data?.location?.pano;
      if (responseStatus !== maps.StreetViewStatus.OK || !panoId) {
        setStatus("unavailable");
        return;
      }

      panoramaRef.current = new maps.StreetViewPanorama(
        containerRef.current!,
        {
          pano: panoId,
          pov: initialSelection
            ? {
                heading: initialSelection.heading,
                pitch: initialSelection.pitch,
              }
            : { heading: 0, pitch: 0 },
          visible: true,
          addressControl: false,
          fullscreenControl: true,
        }
      );
      setStatus("ready");
    });

    return () => {
      cancelled = true;
      panoramaRef.current = null;
    };
  }, [initialSelection, latitude, longitude, maps]);

  if (!key) {
    return (
      <p className="text-sm text-muted-foreground">
        The interactive Street View picker isn&apos;t configured.
      </p>
    );
  }

  function useCurrentView() {
    const panorama = panoramaRef.current;
    if (!panorama) return;
    const pov = panorama.getPov();
    const panoId = panorama.getPano();
    if (!panoId || !Number.isFinite(pov.heading) || !Number.isFinite(pov.pitch)) {
      setStatus("error");
      return;
    }
    onUseView({
      panoId,
      heading: Math.round(pov.heading * 100) / 100,
      pitch: Math.round(pov.pitch * 100) / 100,
    });
    setSaved(true);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Turn the view and move along the street until guests can clearly recognize
        the property, then approve the exact view below.
      </p>
      <div className="relative overflow-hidden rounded-xl border bg-muted">
        <div ref={containerRef} className="h-[min(52vh,520px)] min-h-72 w-full" />
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
      <div className="flex items-center justify-end gap-3">
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-700">
            <Check className="h-4 w-4" />
            View approved
          </span>
        )}
        <Button type="button" disabled={status !== "ready"} onClick={useCurrentView}>
          Use this view
        </Button>
      </div>
    </div>
  );
}

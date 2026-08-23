"use client";

import * as React from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { loadGoogleMaps } from "@/lib/google-maps-browser";
import { streetViewPanoId } from "@/lib/utils/street-view-response";
import { Tx } from "@/lib/i18n/client";

type StreetViewPov = { heading: number; pitch: number };
type MapsListener = { remove(): void };
type StreetViewPanorama = {
  getPano(): string;
  getPov(): StreetViewPov;
  getZoom(): number;
  setPano(pano: string): void;
  setPov(pov: StreetViewPov): void;
  setZoom(zoom: number): void;
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
      /** Google's own wheel-to-zoom. Turned off for `cooperative`, where a wheel
       *  handler below zooms only while ⌘/Ctrl is held. */
      scrollwheel?: boolean;
      /** The on-street arrows that walk the camera to the next panorama. */
      linksControl?: boolean;
      panControl?: boolean;
      zoomControl?: boolean;
      clickToGo?: boolean;
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
  gestureHandling = "greedy",
}: {
  latitude: number;
  longitude: number;
  initialSelection?: StreetViewSelection | null;
  onUseView?: (selection: StreetViewSelection) => void;
  compact?: boolean;
  readOnly?: boolean;
  fill?: boolean;
  /** "greedy" leaves Google's wheel-to-zoom on. "cooperative" gives the wheel back to
   *  the page and zooms only while ⌘/Ctrl is held — which is also what a trackpad pinch
   *  sends — so scrolling past a panorama embedded in a form no longer zooms it. */
  gestureHandling?: "greedy" | "cooperative";
}) {
  const key =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_JAVASCRIPT_API_KEY?.trim();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panoramaRef = React.useRef<StreetViewPanorama | null>(null);
  const listenersRef = React.useRef<MapsListener[]>([]);
  /** Detaches the cooperative wheel handler, which is a plain DOM listener rather than
   *  one of Google's and so is not covered by `listenersRef`. */
  const wheelCleanupRef = React.useRef<(() => void) | null>(null);
  const onUseViewRef = React.useRef(onUseView);
  const initialSelectionRef = React.useRef(initialSelection);
  const [maps, setMaps] = React.useState<MapsApi | null>(null);
  const [status, setStatus] = React.useState<
    "loading" | "ready" | "unavailable" | "error"
  >("loading");

  React.useEffect(() => {
    onUseViewRef.current = onUseView;
  }, [onUseView]);

  // The panorama is only built once per coordinate, so a read-only preview that is
  // already mounted (the confirmed-location summary sitting behind the editor dialog)
  // would keep showing the view the host started with after they turn the camera and
  // confirm. Push later selections into the live panorama instead of remounting it —
  // remounting on every pov_changed tick would reload Street View continuously while
  // the host drags.
  React.useEffect(() => {
    initialSelectionRef.current = initialSelection;
    const panorama = panoramaRef.current;
    if (!panorama || !readOnly || !initialSelection) return;
    if (initialSelection.panoId && panorama.getPano() !== initialSelection.panoId) {
      panorama.setPano(initialSelection.panoId);
    }
    const pov = panorama.getPov();
    if (
      pov.heading !== initialSelection.heading ||
      pov.pitch !== initialSelection.pitch
    ) {
      panorama.setPov({
        heading: initialSelection.heading,
        pitch: initialSelection.pitch,
      });
    }
  }, [initialSelection, readOnly]);

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

      const cooperative = gestureHandling === "cooperative";
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
          // The controls that make this a real Street View rather than a still: the
          // on-street arrows and click-to-go walk the camera along the road, so a host
          // can step to the corner the guest will actually approach from.
          linksControl: true,
          clickToGo: true,
          panControl: true,
          zoomControl: true,
          scrollwheel: !cooperative,
        }
      );
      if (cooperative && containerRef.current) {
        const element = containerRef.current;
        const handleWheel = (event: WheelEvent) => {
          const panorama = panoramaRef.current;
          if (!panorama) return;
          // A trackpad pinch arrives as a wheel event with ctrlKey set, so pinching
          // zooms and two-finger scrolling still scrolls the page past the panorama.
          if (!event.ctrlKey && !event.metaKey) return;
          event.preventDefault();
          const next = panorama.getZoom() - event.deltaY * 0.01;
          panorama.setZoom(Math.min(5, Math.max(0, next)));
        };
        element.addEventListener("wheel", handleWheel, { passive: false });
        wheelCleanupRef.current = () =>
          element.removeEventListener("wheel", handleWheel);
      }

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
      wheelCleanupRef.current?.();
      wheelCleanupRef.current = null;
      panoramaRef.current = null;
    };
  }, [gestureHandling, latitude, longitude, maps, readOnly]);

  if (!key) {
    return (
      <p className="text-sm text-muted-foreground">
        <Tx
          k="host.street_view.not_configured"
          source="The interactive Street View picker isn't configured."
        />
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
          <Tx
            k="host.street_view.intro"
            source="Turn the view and move along the street until guests can clearly recognize the property. Your selected view is saved automatically."
          />
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
            <Tx k="host.street_view.loading" source="Loading Street View…" />
          </div>
        )}
        {status === "unavailable" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
            <ImageOff className="h-5 w-5" />
            <Tx
              k="host.street_view.unavailable"
              source="No Street View panorama is available near this location."
            />
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-destructive">
            <Tx
              k="host.street_view.load_failed"
              source="Street View couldn't load. Check the API and website restrictions for this key."
            />
          </div>
        )}
      </div>
    </div>
  );
}

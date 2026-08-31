"use client";

import "@photo-sphere-viewer/core/index.css";
import { useEffect, useRef } from "react";
import { Viewer } from "@photo-sphere-viewer/core";
import { Tx, useI18n } from "@/lib/i18n/client";

export default function PanoramaViewer({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolve } = useI18n();

  useEffect(() => {
    let viewer: Viewer | undefined;

    // In development, React Strict Mode runs an effect's setup/cleanup cycle once
    // before the real setup. Starting the viewer immediately makes Three.js share
    // the first mount's aborted request with the second mount, which leaves the
    // replacement viewer on a 0% loader forever. Deferring one frame lets React
    // cancel the discarded setup before it starts any network or WebGL work.
    const frameId = window.requestAnimationFrame(() => {
      if (!containerRef.current) return;

      viewer = new Viewer({
        container: containerRef.current,
        panorama: src,
        caption: alt,
        navbar: ["zoom", "move", "fullscreen"],
        keyboard: "always",
        mousewheelCtrlKey: false,
        touchmoveTwoFingers: false,
        defaultZoomLvl: 35,
        loadingTxt: resolve("gallery.panorama_loading", "Loading 360° view…").text,
        lang: {
          zoom: resolve("gallery.panorama_zoom", "Zoom").text,
          zoomOut: resolve("gallery.panorama_zoom_out", "Zoom out").text,
          zoomIn: resolve("gallery.panorama_zoom_in", "Zoom in").text,
          move: resolve("gallery.panorama_move", "Move").text,
          fullscreen: resolve("gallery.panorama_fullscreen", "Fullscreen").text,
        },
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      viewer?.destroy();
    };
  }, [alt, resolve, src]);

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="h-full w-full"
        role="img"
        aria-label={alt}
      />
      <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
        <Tx k="gallery.panorama_badge" source="360° photo" />
      </div>
    </div>
  );
}

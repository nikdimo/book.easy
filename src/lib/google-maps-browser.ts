"use client";

type GoogleMapsWindow = typeof window & {
  google?: { maps?: Record<string, unknown> };
  __bookEasyGoogleMapsReady?: () => void;
};

let mapsPromise: Promise<Record<string, unknown>> | null = null;

/**
 * Resolves only after Google's callback says every requested constructor is ready.
 * A script load event fires too early when the API uses `loading=async`.
 */
export function loadGoogleMaps(
  key: string
): Promise<Record<string, unknown>> {
  const browserWindow = window as GoogleMapsWindow;
  const existingMaps = browserWindow.google?.maps;
  if (existingMaps?.Map) return Promise.resolve(existingMaps);
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve, reject) => {
    const callbackName = "__bookEasyGoogleMapsReady";
    browserWindow[callbackName] = () => {
      const maps = browserWindow.google?.maps;
      delete browserWindow[callbackName];
      if (maps?.Map) resolve(maps);
      else reject(new Error("Google Maps loaded without the map library"));
    };

    const script = document.createElement("script");
    script.id = "bookeasy-google-maps-api";
    script.async = true;
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(key)}` +
      "&v=weekly&loading=async&libraries=maps,marker,streetView" +
      `&callback=${callbackName}`;
    script.onerror = () => {
      delete browserWindow[callbackName];
      mapsPromise = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
  });

  return mapsPromise;
}

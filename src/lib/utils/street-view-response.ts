type StreetViewPanoramaData = {
  location?: { pano?: string };
};

type StreetViewResponse =
  | StreetViewPanoramaData
  | { data: StreetViewPanoramaData }
  | null;

/**
 * Google returns panorama data directly to getPanorama's callback, while its
 * Promise API wraps the same data in a `data` property.
 */
export function streetViewPanoId(response: StreetViewResponse) {
  if (!response) return undefined;
  const panoramaData = "data" in response ? response.data : response;
  return panoramaData?.location?.pano;
}

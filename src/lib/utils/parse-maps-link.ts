const COORD_PATTERNS = [
  // .../@41.6086,21.7453,15z or .../@41.6086,21.7453
  /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  // ?q=41.6086,21.7453 or &q=41.6086,21.7453 (but not q=place+name)
  /[?&]q=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  // !3d41.6086!4d21.7453 (Google's embedded place-pin format)
  /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
  // ll=41.6086,21.7453
  /[?&]ll=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  // bare "41.6086, 21.7453" pasted directly
  /^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/,
];

function toCoords(latStr: string, lngStr: string): { lat: number; lng: number } | null {
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Extracts a {lat, lng} pair from a Google Maps URL or a raw "lat,lng" string. */
export function parseCoordsFromMapsText(text: string): { lat: number; lng: number } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const pattern of COORD_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      const coords = toCoords(match[1], match[2]);
      if (coords) return coords;
    }
  }
  return null;
}

/** Short-link hosts (goo.gl, maps.app.goo.gl) don't carry coordinates until resolved. */
export function isShortMapsLink(text: string): boolean {
  try {
    const url = new URL(text.trim());
    return /(^|\.)goo\.gl$/.test(url.hostname);
  } catch {
    return false;
  }
}

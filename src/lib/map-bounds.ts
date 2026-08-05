/**
 * The map viewport as a search filter. The explorer writes the visible rectangle
 * into the URL (`?bbox=west,south,east,north`) whenever the user pans or zooms,
 * and the server narrows the result set to listings inside it — so the list, the
 * count and the pins always describe the same piece of the world.
 */

export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export const MAP_BOUNDS_PARAM = "bbox";

/** Enough precision for street-level panning without bloating the URL. */
const COORD_PRECISION = 5;

function normalizeLongitude(value: number) {
  // Leaflet keeps counting past ±180 when the user drags across the antimeridian
  // (or spins the world round a few times), so fold back into the real range.
  const wrapped = ((((value + 180) % 360) + 360) % 360) - 180;
  return wrapped;
}

export function stringifyMapBounds(bounds: MapBounds) {
  return [bounds.west, bounds.south, bounds.east, bounds.north]
    .map((value) => Number(value.toFixed(COORD_PRECISION)))
    .join(",");
}

/**
 * Returns `null` for anything that shouldn't narrow the search: malformed input,
 * an inverted rectangle, or a viewport wide enough to contain the whole planet
 * (zoomed all the way out — every listing is "in view", so filtering is a no-op).
 */
export function parseMapBounds(value: string | null | undefined): MapBounds | null {
  if (!value) return null;

  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;

  const [rawWest, rawSouth, rawEast, rawNorth] = parts as [
    number,
    number,
    number,
    number,
  ];

  const south = Math.max(-90, Math.min(90, rawSouth));
  const north = Math.max(-90, Math.min(90, rawNorth));
  if (south >= north) return null;

  // A span at or beyond a full turn covers every longitude.
  if (rawEast - rawWest >= 360) return null;

  const west = normalizeLongitude(rawWest);
  const east = normalizeLongitude(rawEast);
  if (west === east) return null;

  return { west, south, east, north };
}

/** True when the rectangle wraps across the antimeridian (west is east of east). */
export function crossesAntimeridian(bounds: MapBounds) {
  return bounds.west > bounds.east;
}

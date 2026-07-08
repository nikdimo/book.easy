/** Approximate centers for map pins when Property has no lat/lng (North Macedonia). */
const CITY_CENTERS: Record<string, [number, number]> = {
  Skopje: [41.9973, 21.428],
  Ohrid: [41.1231, 20.8016],
  Bitola: [41.0312, 21.3347],
  Struga: [41.1778, 20.6764],
  Tetovo: [42.0097, 20.9715],
  Prilep: [41.3441, 21.5528],
  Kumanovo: [42.1322, 21.7144],
  Veles: [41.7156, 21.7756],
  Krushevo: [41.3689, 21.2489],
  Mavrovo: [41.66, 20.74],
};

const DEFAULT_CENTER: [number, number] = [41.6086, 21.7453];

function hashOffset(id: string): [number, number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const r1 = (h % 1000) / 50000;
  const r2 = (((h >> 8) % 1000) / 50000) * (h % 2 === 0 ? 1 : -1);
  return [r1, r2];
}

export function getMapCoordinatesForListing(listing: {
  id: string;
  property: {
    city: string;
    latitude?: number | null;
    longitude?: number | null;
  };
}): { lat: number; lng: number } {
  const { latitude: lat, longitude: lng, city } = listing.property;
  if (
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
  ) {
    return { lat, lng };
  }
  const normalized = city.trim();
  const base =
    CITY_CENTERS[normalized] ??
    CITY_CENTERS[normalized.split(/[\s,]+/)[0] ?? ""] ??
    DEFAULT_CENTER;
  const [jLat, jLng] = hashOffset(listing.id);
  return { lat: base[0] + jLat, lng: base[1] + jLng };
}

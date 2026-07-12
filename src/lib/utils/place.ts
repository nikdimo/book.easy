/** A distinct destination — city names alone can collide across countries, so search
 * and the autocomplete key off the (city, country) pair rather than city text alone. */
export interface PlaceOption {
  city: string;
  country: string;
}

/** Stable lookup key for a place — not for display (see `placeLabel`). */
export function placeKey(p: PlaceOption): string {
  return `${p.city.toLowerCase()}|${p.country.toLowerCase()}`;
}

export function placeLabel(p: PlaceOption): string {
  return `${p.city}, ${p.country}`;
}

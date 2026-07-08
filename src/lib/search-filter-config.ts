export const PRICE_RANGE_MIN = 10;
export const PRICE_RANGE_MAX = 800;
export const PRICE_RANGE_STEP = 10;

function clampPrice(value: number) {
  return Math.min(PRICE_RANGE_MAX, Math.max(PRICE_RANGE_MIN, value));
}

export function resolvePriceRange(
  minPrice?: number,
  maxPrice?: number
): [number, number] {
  const min = clampPrice(minPrice ?? PRICE_RANGE_MIN);
  const max = clampPrice(maxPrice ?? PRICE_RANGE_MAX);

  if (min > max) {
    return [PRICE_RANGE_MIN, PRICE_RANGE_MAX];
  }

  return [min, max];
}

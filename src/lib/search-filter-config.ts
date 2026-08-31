import { BASE_CURRENCY } from "@/lib/currency/currency-preference";

/**
 * The currency the price slider's own numbers are authored in.
 *
 * The slider is a fixed 10–800 track, which is a meaningful nightly band in euros and
 * nothing at all in denars — so the numbers stay euros and the *labels* are converted
 * into whatever the visitor is browsing in (see `usePriceRangeLabel`). What used to be
 * missing is the other half of that: the server was handed the two euro numbers with
 * nothing saying so, and compared them against whatever currency each host quoted in.
 *
 * `PRICE_CURRENCY_PARAM` closes that. Every URL carrying a price band now names the
 * currency the band is in, and the search service normalises each listing into it
 * before comparing. A link shared before this existed carries no parameter and is read
 * as euros — which is exactly what its numbers already meant.
 */
export const PRICE_FILTER_CURRENCY = BASE_CURRENCY;

/** URL parameter naming the currency `minPrice`/`maxPrice` are stated in. */
export const PRICE_CURRENCY_PARAM = "priceCurrency";

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

/** Writes a price band and the currency it is stated in, so the three places that
 *  build this URL cannot drift apart on the naming. */
export function setPriceParams(
  params: URLSearchParams,
  range: [number, number]
): void {
  params.set("minPrice", String(range[0]));
  params.set("maxPrice", String(range[1]));
  params.set(PRICE_CURRENCY_PARAM, PRICE_FILTER_CURRENCY);
}

/** Removes the band and its currency together — a stranded `priceCurrency` would say
 *  a filter is active that no longer is. */
export function clearPriceParams(params: URLSearchParams): void {
  params.delete("minPrice");
  params.delete("maxPrice");
  params.delete(PRICE_CURRENCY_PARAM);
}

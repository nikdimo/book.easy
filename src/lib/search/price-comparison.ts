import { convertAmount, type ConversionContext } from "@/lib/currency/convert";

/**
 * Making prices from different currencies comparable, for the one place in the
 * product that has to rank and threshold them against each other.
 *
 * Nothing here touches a stored or payable amount. A listing stays quoted in its
 * host's currency everywhere it is *shown*; this module only produces the throwaway
 * numbers a search needs to answer "is this between 80 and 150 EUR" and "which of
 * these two is cheaper", and it refuses to answer at all rather than answer by
 * comparing a denar to a euro.
 */

/**
 * What one listing's card leads with, and how far its prices span.
 *
 * `low === high` for a dated search: the card shows one number there (the stay's
 * effective average nightly rate), so there is nothing to span. Undated cards show a
 * real range, and both ends matter — see `bandMatchesBounds`.
 */
export interface PriceBand {
  low: number;
  high: number;
}

/** A price band expressed in a named currency, before normalisation. */
export interface QuotedPriceBand extends PriceBand {
  /** The listing's official currency — what `low`/`high` are denominated in. */
  currency: string;
}

/**
 * The filter's own bounds, after the URL has been taken at less than its word.
 *
 * `null` means "no bound on this side", which is different from `0` — a zero lower
 * bound is a no-op but a zero *upper* bound is a real filter, and the truthiness test
 * this replaces silently dropped both.
 */
export interface PriceBounds {
  min: number | null;
  max: number | null;
}

export const NO_PRICE_BOUNDS: PriceBounds = { min: null, max: null };

/**
 * Reads the two raw URL numbers into bounds that mean something.
 *
 * - Non-finite (a hand-edited `?minPrice=abc` arrives as `NaN`) is not a bound.
 * - A negative lower bound is not a bound either: no listing is priced below zero, so
 *   it excludes nothing. A negative *upper* bound is kept — it is a filter that
 *   genuinely matches nothing, and quietly widening it would return a page the guest
 *   did not ask for.
 * - An inverted band (`min > max`) is dropped entirely rather than treated as empty.
 *   `resolvePriceRange` in lib/search-filter-config.ts already resets the slider to
 *   its full span in exactly this case, so dropping it here is what keeps the panel
 *   the guest is looking at and the results they are given saying the same thing.
 */
export function normalizePriceBounds(
  minPrice?: number | null,
  maxPrice?: number | null,
): PriceBounds {
  const min =
    typeof minPrice === "number" && Number.isFinite(minPrice) && minPrice > 0
      ? minPrice
      : null;
  const max =
    typeof maxPrice === "number" && Number.isFinite(maxPrice) ? maxPrice : null;

  if (min !== null && max !== null && min > max) return NO_PRICE_BOUNDS;
  return { min, max };
}

export function hasPriceBounds(bounds: PriceBounds): boolean {
  return bounds.min !== null || bounds.max !== null;
}

/**
 * The band restated in the filter's currency, or `null` when it cannot be.
 *
 * Null is the whole point of this function. There is no "close enough" fallback and no
 * defaulting to the raw number: a band that cannot be converted is a band that must
 * not be compared, and every caller here treats null as "I do not know where this
 * listing sits" rather than "this listing is cheap".
 *
 * Both ends go through the same `ConversionContext`, so one search converts every
 * listing against one rate snapshot and two listings can never be ranked against each
 * other at two different moments' rates.
 */
export function convertPriceBand(
  band: QuotedPriceBand,
  filterCurrency: string,
  context: ConversionContext | null,
): PriceBand | null {
  if (!Number.isFinite(band.low) || !Number.isFinite(band.high)) return null;
  if (band.currency === filterCurrency) return { low: band.low, high: band.high };
  if (!context || context.display !== filterCurrency) return null;

  const low = convertAmount(band.low, band.currency, context);
  const high = convertAmount(band.high, band.currency, context);
  if (low === null || high === null) return null;
  return { low, high };
}

/**
 * Whether a listing belongs in a price-filtered result set.
 *
 * **Both bounds are inclusive.** "Up to 150" includes a listing priced at exactly 150;
 * the guest read the number off the slider, and a listing sitting on it is one they
 * were promised.
 *
 * **A range matches when it overlaps the band.** This is the rule for undated
 * searches, where a card shows a span rather than one price. Overlap is the only rule
 * under which the filter never hides a listing that can actually be booked at an
 * in-band price: a home that goes for 120 most of the year and 300 in August genuinely
 * answers "under 150", and the card says so in full — both ends of the range are
 * printed, so nothing is implied that the listing will not honour. The stricter
 * reading (the whole range must fit inside the band) would drop it, and a guest
 * scrolling past 120-per-night homes because of an August price is worse served than
 * one who sees the span.
 *
 * A dated search collapses to a single number, so overlap and containment are the same
 * test there and this reads as the plain inclusive comparison it looks like.
 */
export function bandMatchesBounds(
  band: PriceBand,
  { min, max }: PriceBounds,
): boolean {
  if (min !== null && band.high < min) return false;
  if (max !== null && band.low > max) return false;
  return true;
}

/**
 * One listing as the price stage sees it: an identity, a tie-break, and either a
 * normalised band or an admission that it has none.
 */
export interface PriceCandidate {
  id: string;
  /** Milliseconds, for the newest-first tie-break. */
  createdAt: number;
  /** Normalised into the filter currency. Null when it could not be — no pricing rule
   *  at all, or no usable rate between its currency and the filter's. */
  band: PriceBand | null;
}

export type PriceSort = "price_asc" | "price_desc" | "newest";

/**
 * Newest first, then id — the platform's default order, and the tie-break under every
 * other order.
 *
 * The id leg is what makes pagination stable. Two listings created in the same
 * millisecond (a seeded dataset, a bulk import) otherwise come back in whatever order
 * the query planner felt like, and a guest paging through them sees one listing twice
 * and never sees another.
 */
function compareNewestFirst(left: PriceCandidate, right: PriceCandidate): number {
  if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
  return left.id.localeCompare(right.id);
}

/**
 * The full result order for a price-aware search.
 *
 * Listings whose band could not be normalised are not dropped here — dropping is the
 * price *filter's* job, and only when a bound was actually asked for. Under a price
 * *sort* with no bounds they keep their place in the result set and collect at the
 * end, newest first. Ranking them among the comparable ones would mean guessing where
 * they sit, and hiding them would mean a currency outage quietly shrinking the
 * marketplace.
 *
 * Both directions rank the same value — the band's low end, which is the number the
 * card leads with. Using low for ascending and high for descending would make the two
 * orders disagree about which listing is "the cheaper one", and neither would match
 * what the card prints.
 */
export function comparePriceCandidates(
  left: PriceCandidate,
  right: PriceCandidate,
  sort: PriceSort,
): number {
  if (sort === "newest") return compareNewestFirst(left, right);

  if (left.band === null || right.band === null) {
    if (left.band !== null) return -1;
    if (right.band !== null) return 1;
    return compareNewestFirst(left, right);
  }

  if (left.band.low !== right.band.low) {
    return sort === "price_asc"
      ? left.band.low - right.band.low
      : right.band.low - left.band.low;
  }
  return compareNewestFirst(left, right);
}

/**
 * The ordered ids a price-aware search should page through.
 *
 * Filtering happens before sorting and sorting before the caller slices a page out,
 * which is the ordering the whole of this module turns on: sorting a page the database
 * already chose gives twelve listings shuffled among themselves rather than the twelve
 * cheapest.
 */
export function orderPriceCandidates(
  candidates: PriceCandidate[],
  bounds: PriceBounds,
  sort: PriceSort,
): string[] {
  const filtered = hasPriceBounds(bounds)
    ? candidates.filter(
        (candidate) =>
          candidate.band !== null && bandMatchesBounds(candidate.band, bounds),
      )
    : candidates;

  return [...filtered]
    .sort((left, right) => comparePriceCandidates(left, right, sort))
    .map((candidate) => candidate.id);
}

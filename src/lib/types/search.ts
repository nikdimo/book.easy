import type { MapBounds } from "@/lib/map-bounds";

export interface SearchFilters {
  city?: string;
  /** Only set when the exact (city, country) pair is known (e.g. picked from the
   * autocomplete) — narrows the `city` match instead of the default fuzzy contains. */
  country?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  minPrice?: number;
  maxPrice?: number;
  /**
   * The currency `minPrice`/`maxPrice` are stated in, and the one every listing's
   * price is normalised into before it is filtered or sorted.
   *
   * Carried explicitly rather than inferred, because the alternative is what M5 was:
   * two bare numbers compared against whatever currency each host happened to quote
   * in. It arrives from the URL (`priceCurrency`) so a shared or bookmarked link
   * keeps meaning the same band, and defaults to `BASE_CURRENCY` — the currency the
   * slider is authored in and the one every pre-existing link's numbers were.
   */
  currency?: string;
  bedrooms?: number;
  amenities?: string[];
  /** Subset of Prisma `PropertyType`; omit or empty means no type restriction. */
  propertyTypes?: string[];
  page?: number;
  sort?: "price_asc" | "price_desc" | "newest";
  /** Visible map rectangle; listings outside it (and listings with no coordinates
   * at all, since they can never be shown on the map) are excluded. */
  bounds?: MapBounds;
}

/**
 * What the price stage did, stated rather than implied.
 *
 * A price filter that silently drops listings it could not convert is the failure
 * this exists to make visible: the count, the cards, the map and the filter panel all
 * read this same object, so they cannot disagree about which currency the band was
 * compared in or whether anything was left out of it.
 */
export interface SearchPriceComparison {
  /** Currency the bounds were stated in and every listing was normalised into. */
  currency: string;
  /** True when a bound or a price sort made this comparison load-bearing. */
  applied: boolean;
  /** False when at least one otherwise-matching listing quotes a currency this
   *  search could not convert — no rate table at all, or that currency unquoted. */
  complete: boolean;
  /** How many such listings there were. Excluded from a price-bounded result set
   *  (the band cannot be honoured for them); sorted last, never hidden, under a
   *  price sort with no bounds. */
  unconvertible: number;
}

export interface SearchFilterPreview {
  totalCount: number;
  availablePropertyTypes: string[];
  availableAmenities: string[];
  maxBedrooms: number;
  priceComparison: SearchPriceComparison;
}

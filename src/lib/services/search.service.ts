import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { ListingStatus, Prisma } from "@prisma/client";
import { ITEMS_PER_PAGE } from "@/lib/constants";
import { sortPropertyTypesInDisplayOrder } from "@/lib/property-type-filter";
import { getActivePropertyTypes } from "@/lib/services/property-type.service";
import { getAmenityCatalogWithPetsFilter } from "@/lib/services/amenity.service";
import {
  PETS_ALLOWED_AMENITY_NAME,
  isPetsAllowedFilter,
} from "@/lib/amenities/pets";
import {
  serializeListingCard,
  listingCardSelect,
  getFirstVideoUrlsByListingIds,
} from "@/lib/serializers/listing-card";
import { placeKey, type PlaceOption } from "@/lib/utils/place";
import { crossesAntimeridian } from "@/lib/map-bounds";
import type {
  SearchFilterPreview,
  SearchFilters,
  SearchPriceComparison,
} from "@/lib/types/search";
import {
  computeStayQuote,
  parseLocalYmd,
  toStayPromotion,
  type NightlyRateRange,
} from "@/lib/utils/stay-pricing";
import {
  dbDateToYmd,
  isValidYmd,
  nightsBetweenYmd,
  ymdToDbDate,
} from "@/lib/utils/date-only";
import {
  windowsCoverStay,
  windowsOverlappingStay,
} from "@/lib/utils/availability-windows";
import { getNightlyRateRangesForListings } from "@/lib/services/pricing.service";
import { getExchangeRates } from "@/lib/currency/rates";
import {
  BASE_CURRENCY,
  normalizeCurrencyCode,
} from "@/lib/currency/currency-preference";
import type { ConversionContext } from "@/lib/currency/convert";
import {
  convertPriceBand,
  hasPriceBounds,
  normalizePriceBounds,
  orderPriceCandidates,
  type PriceBounds,
  type PriceCandidate,
  type PriceSort,
} from "@/lib/search/price-comparison";

/** Listings without a pricing rule have no rate to range over, so they are dropped
 * rather than defaulted to zero. */
function rateRangeInputs(
  listings: { id: string; pricingRule: { baseNightlyRate: Prisma.Decimal } | null }[]
) {
  return listings.flatMap((listing) =>
    listing.pricingRule
      ? [{ id: listing.id, baseNightlyRate: Number(listing.pricingRule.baseNightlyRate) }]
      : []
  );
}

/** Invalidated on-demand (via revalidateTag) whenever a listing's public visibility
 * changes — see submitNewListing/updateListing in lib/actions/listing.actions.ts and
 * suspendListing in lib/actions/admin.actions.ts — with a time-based fallback so it's
 * never wrong for more than a few minutes either way. */
export const PUBLIC_HEADER_DATA_TAG = "public-header-data";

/** Grid/search cards show at most a handful of photos (hover carousel) — fetching all
 * of a listing's images per card (previously up to 8) is wasted payload for a list
 * view; the full gallery loads on the listing detail page instead. */
const CARD_IMAGE_LIMIT = 4;

/** The home page's listing rows are public and identical for every visitor, but were
 * re-queried on every hit because the root layout forces dynamic rendering. A short
 * window keeps the page feeling live (a newly approved listing shows up within a
 * minute at worst) while taking the repeat queries off the database entirely.
 * `revalidatePublicListingCaches()` invalidates these immediately on approval or
 * suspension, so the window is a fallback rather than the primary mechanism. */
const HOME_LISTINGS_REVALIDATE_SECONDS = 60;

/**
 * The stay a dated search is actually asking for, or `null` when it isn't asking for a
 * real one.
 *
 * `checkIn`/`checkOut` arrive as raw URL strings, so they carry whatever a shared link
 * or a hand-edited address bar held: an unparseable value, a check-out before its
 * check-in, or the same day twice. None of those describe a stay anyone can book, and a
 * search that quietly ignored them returned a full page of listings against a range the
 * booking server refuses on sight.
 */
function requestedStay(
  filters: SearchFilters,
): { checkIn: Date; checkOut: Date; nights: number } | null {
  if (!filters.checkIn || !filters.checkOut) return null;
  if (!isValidYmd(filters.checkIn) || !isValidYmd(filters.checkOut)) {
    return null;
  }
  const checkIn = ymdToDbDate(filters.checkIn);
  const checkOut = ymdToDbDate(filters.checkOut);
  const nights = nightsBetweenYmd(filters.checkIn, filters.checkOut);
  if (nights <= 0) return null;
  return { checkIn, checkOut, nights };
}

/** A `where` no listing satisfies — for a dated search whose dates are unbookable. */
const MATCHES_NOTHING: Prisma.ListingWhereInput = { id: { in: [] } };

/**
 * Which closed-by-default listings have open windows covering the whole stay.
 *
 * This is the one place the shared availability rule cannot be pushed into SQL. Coverage
 * by a *union* of touching windows is a fold across sibling rows, and a Prisma relation
 * filter can only ask about one row at a time — `some: { spans the whole stay }` is the
 * question that produced the disagreement in the first place, since it cannot see that
 * the window ending on the 15th is continued by the one starting on the 15th.
 *
 * So the database narrows (only approved closed listings with a window overlapping these
 * dates can qualify — a listing with no overlapping window covers none of the stay) and
 * `windowsCoverStay` decides, exactly as it decides for `checkAvailability` and
 * `createBooking`. The narrowing keeps this proportional to the listings open anywhere
 * near the requested dates rather than the whole table.
 */
async function closedListingIdsOpenForStay(
  checkIn: Date,
  checkOut: Date,
): Promise<string[]> {
  const overlapping = windowsOverlappingStay(checkIn, checkOut);
  const candidates = await db.listing.findMany({
    where: {
      status: ListingStatus.APPROVED,
      availabilityMode: "CLOSED",
      availabilityWindows: { some: overlapping },
    },
    select: {
      id: true,
      availabilityWindows: {
        where: overlapping,
        select: { startDate: true, endDate: true },
      },
    },
  });

  return candidates
    .filter((listing) =>
      windowsCoverStay(listing.availabilityWindows, checkIn, checkOut),
    )
    .map((listing) => listing.id);
}

async function buildListingWhere(
  filters: SearchFilters,
): Promise<Prisma.ListingWhereInput> {
  const where: Prisma.ListingWhereInput = {
    status: ListingStatus.APPROVED,
  };
  const stay = requestedStay(filters);
  // Both dates given but not a bookable stay (reversed, same day, unparseable): match
  // nothing rather than falling back to undated discovery. The guest asked for those
  // dates, and a full page of listings that the booking server would refuse for them is
  // the same disagreement this change exists to remove. A search carrying only one of
  // the two has not named a stay yet and keeps its undated behaviour.
  if (filters.checkIn && filters.checkOut && !stay) return MATCHES_NOTHING;
  const hasStayDates = stay !== null;
  // Closed-by-default listings are useful only to guests searching dates the host
  // explicitly opened. Keep them out of undated discovery and the home page.
  if (!hasStayDates) where.availabilityMode = "OPEN";
  const requestedNights = stay?.nights;

  if (filters.city && filters.country) {
    // Exact (city, country) pair — known from the autocomplete — so two same-named
    // cities in different countries don't get merged into one result set.
    where.property = {
      city: { equals: filters.city, mode: "insensitive" },
      country: { equals: filters.country, mode: "insensitive" },
    };
  } else if (filters.city) {
    where.property = {
      OR: [
        { city: { contains: filters.city, mode: "insensitive" } },
        { area: { contains: filters.city, mode: "insensitive" } },
        { country: { contains: filters.city, mode: "insensitive" } },
      ],
    };
  }

  if (filters.guests) {
    where.maxGuests = { gte: filters.guests };
  }

  if (filters.bedrooms) {
    where.bedrooms = { gte: filters.bedrooms };
  }

  if (filters.propertyTypes && filters.propertyTypes.length > 0) {
    where.property = {
      ...(where.property as Prisma.PropertyWhereInput),
      propertyType: { in: filters.propertyTypes },
    };
  }

  // `minPrice`/`maxPrice` are deliberately absent from this `where`.
  //
  // They used to compare two bare numbers against `pricingRule.baseNightlyRate`,
  // whatever currency the host quoted in, and against the base rate rather than the
  // figure the card prints. Both are resolved in `resolvePriceScope` now: the effective
  // price is not a column (it needs date overrides, promotions and blocked nights) and
  // the comparison is not a number (it needs one exchange-rate snapshot shared by every
  // listing in the search). What is left here is the stay-length rule, which really is
  // a column comparison.
  if (requestedNights != null && requestedNights > 0) {
    // Spelled `is:` rather than the bare shorthand because of the `OR` below: with a
    // top-level `OR` key, the shorthand resolves to the relation filter's own
    // `is`/`isNot` shape instead of PricingRuleWhereInput. Same query either way.
    where.pricingRule = {
      is: {
        // Both ends of the host's stay-length rule, so results and the booking server
        // agree. `maxNights` was missing here, which is how a 30-night search returned
        // a listing capped at 14 and priced all 30 nights before refusing at submit.
        //
        // A cap only counts when it is at least one night. The column is non-nullable
        // (`@default(365)`), so "no maximum" is spelled as a stored zero rather than a
        // null, and a zero must not be read as "no stay is ever bookable" — the same
        // reading `exceedsMaxNights` applies for the widget and `createBooking`.
        minNights: { lte: requestedNights },
        OR: [{ maxNights: { lt: 1 } }, { maxNights: { gte: requestedNights } }],
      },
    };
  }

  const andClauses: Prisma.ListingWhereInput[] = [];

  if (filters.amenities && filters.amenities.length > 0) {
    // Must have ALL selected amenities (US-05.05 / phase-1-scope.md technical
    // acceptance criteria), not just any one of them — one `some` clause per amenity,
    // ANDed together.
    //
    // "Pets allowed" is the exception, and deliberately still a filter token rather than
    // a filter of its own: guests have bookmarked and shared `?amenities=Pets+allowed`,
    // and the panel is where they look for it. What changed underneath is where the
    // answer is read from — `Listing.petPolicy`, since the amenity that used to carry it
    // was migrated into that column and its join rows deleted. A join clause here would
    // now match nothing at all.
    //
    // ASK_HOST does not match. A guest filtering for "pets allowed" is looking for a
    // place they can bring a pet to, not one where they may ask; returning maybes as
    // matches is how a filter stops meaning anything.
    andClauses.push(
      ...filters.amenities.map((name) =>
        isPetsAllowedFilter(name)
          ? { petPolicy: "ALLOWED" as const }
          : { amenities: { some: { amenity: { name } } } }
      )
    );
  }

  if (filters.bounds) {
    const { west, south, east, north } = filters.bounds;
    // Kept out of `where.property` on purpose: that key is claimed by the city and
    // property-type branches above, and the antimeridian case needs an `OR` of its
    // own that would collide with the fuzzy-city `OR`.
    andClauses.push({
      property: {
        latitude: { gte: south, lte: north },
        ...(crossesAntimeridian(filters.bounds)
          ? { OR: [{ longitude: { gte: west } }, { longitude: { lte: east } }] }
          : { longitude: { gte: west, lte: east } }),
      },
    });
  }

  if (stay) {
    where.availabilityBlocks = {
      none: {
        startDate: { lt: stay.checkOut },
        endDate: { gt: stay.checkIn },
      },
    };
    andClauses.push({
      OR: [
        { availabilityMode: "OPEN" },
        {
          availabilityMode: "CLOSED",
          // Resolved against the shared rule rather than asked of one window at a
          // time — see closedListingIdsOpenForStay for why this leg cannot stay in SQL.
          id: { in: await closedListingIdsOpenForStay(stay.checkIn, stay.checkOut) },
        },
      ],
    });
  }

  if (andClauses.length > 0) where.AND = andClauses;

  return where;
}

async function collectAvailablePropertyTypes(
  values: readonly string[]
): Promise<string[]> {
  const allTypes = await getActivePropertyTypes();
  const allValues = allTypes.map((t) => t.value);
  return sortPropertyTypesInDisplayOrder([...new Set(values)], allValues);
}

/** The sort a search asked for, with anything unrecognised falling back to the
 *  platform default rather than to an arbitrary price order. */
function requestedSort(filters: SearchFilters): PriceSort {
  return filters.sort === "price_asc" || filters.sort === "price_desc"
    ? filters.sort
    : "newest";
}

/** The currency this search's price bounds are stated in, and the one every listing
 *  is normalised into. An unsupported or missing code falls back to the base currency,
 *  which is what the slider is authored in and what every pre-existing link meant. */
function filterCurrencyOf(filters: SearchFilters): string {
  return normalizeCurrencyCode(filters.currency) ?? BASE_CURRENCY;
}

/** Exactly what pricing a listing takes: its own rate and currency, the offers that
 *  could apply, and when it was created so equal prices still order stably. */
const priceCandidateSelect = {
  id: true,
  createdAt: true,
  pricingRule: {
    select: { baseNightlyRate: true, cleaningFee: true, currency: true },
  },
  promotions: {
    where: { disabledAt: null },
    select: {
      id: true,
      type: true,
      discountPercent: true,
      minimumNights: true,
      freeCleaning: true,
      roundToWholeUnit: true,
      startDate: true,
      endDate: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.ListingSelect;

type PriceCandidateRow = Prisma.ListingGetPayload<{
  select: typeof priceCandidateSelect;
}>;

/** Per-listing nightly overrides for the requested stay, keyed the way
 *  `computeStayQuote` reads them — the same construction the card uses, so the two
 *  cannot price the same nights differently. */
async function stayOverridesByListing(
  listingIds: string[],
  stay: { checkIn: Date; checkOut: Date },
): Promise<{
  overrides: Map<string, Map<string, number>>;
  rows: Map<string, { date: string; rate: number }[]>;
}> {
  const overrides = new Map<string, Map<string, number>>();
  const rows = new Map<string, { date: string; rate: number }[]>();
  if (listingIds.length === 0) return { overrides, rows };

  const datePrices = await db.listingDatePrice.findMany({
    where: {
      listingId: { in: listingIds },
      date: { gte: stay.checkIn, lt: stay.checkOut },
    },
    select: { listingId: true, date: true, nightlyRate: true },
  });

  for (const row of datePrices) {
    // `date` is `@db.Date`: its UTC fields are the day the host priced, and reading
    // them locally would key a June 10 override as "2026-06-09" on any server behind
    // UTC — the same key `computeStayQuote` then fails to find (M6).
    const key = dbDateToYmd(row.date);
    const rate = Number(row.nightlyRate);
    const map = overrides.get(row.listingId) ?? new Map<string, number>();
    map.set(key, rate);
    overrides.set(row.listingId, map);
    rows.set(row.listingId, [...(rows.get(row.listingId) ?? []), { date: key, rate }]);
  }

  return { overrides, rows };
}

/**
 * The price a listing's search card actually leads with, in the listing's own
 * currency.
 *
 * This is the figure M5 is about. The old filter read `baseNightlyRate`, so a home
 * with a €100 base and a €300 June override matched "under €150" and then rendered
 * €300 — filter and card disagreeing about the same listing.
 *
 * **With dates** the card prints `computeStayQuote(...).effectiveAverageNightly`:
 * the stay's own average after date overrides and any qualifying promotion. That is a
 * single number, so `low === high`.
 *
 * **Without dates** the card prints the span of bookable nightly rates over the next
 * year (`computeNightlyRateRange`, which already skips blocked nights). Both ends are
 * carried, because the filter rule for a range is overlap — see `bandMatchesBounds`.
 * A listing with nothing bookable in that horizon has no range; it keeps the base
 * rate, which is exactly what the card falls back to.
 */
function quotedBandFor(
  row: PriceCandidateRow,
  stay: { checkIn: Date; checkOut: Date } | null,
  overridesByListing: Map<string, Map<string, number>>,
  nightlyRanges: Map<string, NightlyRateRange>,
) {
  if (!row.pricingRule) return null;
  const currency = row.pricingRule.currency;
  const baseNightly = Number(row.pricingRule.baseNightlyRate);

  if (stay) {
    const quote = computeStayQuote({
      baseNightly,
      cleaningFee: Number(row.pricingRule.cleaningFee),
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      overrides: overridesByListing.get(row.id) ?? new Map<string, number>(),
      // Windows read off their stored UTC fields before the quote walks local
      // calendar days against them.
      promotions: row.promotions.map(toStayPromotion),
    });
    return {
      currency,
      low: quote.effectiveAverageNightly,
      high: quote.effectiveAverageNightly,
    };
  }

  const range = nightlyRanges.get(row.id);
  return range
    ? { currency, low: range.min, high: range.max }
    : { currency, low: baseNightly, high: baseNightly };
}

/**
 * The rate snapshot, or nothing.
 *
 * `getExchangeRates` already returns null when the provider is down and no usable
 * snapshot is stored, but it can also *throw* — it is wrapped in `unstable_cache`,
 * which raises outside a request context, and the database read behind the snapshot
 * can fail on its own. None of those are reasons to fail a search: they all mean the
 * same thing, which is that nothing here may compare two currencies. Every caller
 * treats a null as "not comparable" and says so, which is the honest answer to a rate
 * lookup that did not work.
 */
async function rateTableOrNull() {
  try {
    return await getExchangeRates();
  } catch (error) {
    console.warn("[search] exchange rates unavailable for price comparison", error);
    return null;
  }
}

interface PriceScope {
  /** Every listing matching `where` *and* the price bounds, in the requested order.
   *  Authoritative: callers page this list rather than asking the database for a page
   *  and re-sorting it. */
  orderedIds: string[];
  comparison: SearchPriceComparison;
  /** Computed for every candidate on the way here, so the page the caller slices out
   *  does not pay for them a second time. */
  nightlyRanges: Map<string, NightlyRateRange>;
  stayPrices: Map<string, { date: string; rate: number }[]>;
}

/**
 * Filtering and ordering by price, for the searches that ask for either.
 *
 * All of this is in Node rather than SQL, and deliberately so on two counts. The
 * effective price is not a column — it needs the listing's date overrides, its
 * promotions and its blocked nights — and the comparison is not between two numbers:
 * hosts quote in their own currencies, so every price has to be restated in the
 * filter's currency against **one** rate snapshot before any of them can be ranked or
 * thresholded. A `Decimal` column and a hard-coded `10`–`800` band cannot express
 * either.
 *
 * The cost is that this reads every matching listing's pricing rather than one page of
 * it. That is the price of a correct answer, and it is only paid when a price bound or
 * a price sort is actually asked for — plain discovery still pages in the database.
 */
async function resolvePriceScope(
  where: Prisma.ListingWhereInput,
  filters: SearchFilters,
  bounds: PriceBounds,
  sort: PriceSort,
): Promise<PriceScope> {
  const filterCurrency = filterCurrencyOf(filters);
  const stay = requestedStay(filters);
  // Local midnight, matching PropertyCard and the map pins — `computeStayQuote` walks
  // calendar days, and pricing the same stay off two different midnights would put an
  // override on a different night in the filter than on the card.
  const stayDays =
    stay && filters.checkIn && filters.checkOut
      ? {
          checkIn: parseLocalYmd(filters.checkIn),
          checkOut: parseLocalYmd(filters.checkOut),
        }
      : null;

  const rows = await db.listing.findMany({ where, select: priceCandidateSelect });
  const listingIds = rows.map((row) => row.id);

  const [nightlyRanges, stayPricing] = await Promise.all([
    // Only the dateless card shows a range — a search that carries dates prices those
    // exact nights instead, so it would pay for a year of rates it never renders.
    stayDays
      ? Promise.resolve(new Map<string, NightlyRateRange>())
      : getNightlyRateRangesForListings(rateRangeInputs(rows)),
    // The *stored* dates, not the local ones: `date` is a `@db.Date` column that
    // Prisma reads back as UTC midnight, so the window has to be asked for in the same
    // terms it is stored in.
    stay
      ? stayOverridesByListing(listingIds, stay)
      : Promise.resolve({
          overrides: new Map<string, Map<string, number>>(),
          rows: new Map<string, { date: string; rate: number }[]>(),
        }),
  ]);

  const quoted = rows.map((row) => ({
    row,
    band: quotedBandFor(row, stayDays, stayPricing.overrides, nightlyRanges),
  }));

  // Fetching rates is a network call on a cache miss, so a search where every listing
  // already quotes in the filter's currency — the overwhelmingly common one — does not
  // make it. Nothing is being compared across currencies in that case, which is the
  // only reason it is safe to skip.
  const needsConversion = quoted.some(
    (entry) => entry.band !== null && entry.band.currency !== filterCurrency,
  );
  const rateTable = needsConversion ? await rateTableOrNull() : null;
  const context: ConversionContext | null = rateTable
    ? { display: filterCurrency, rates: rateTable.rates }
    : null;

  let unconvertible = 0;
  const candidates: PriceCandidate[] = quoted.map(({ row, band }) => {
    const normalized = band ? convertPriceBand(band, filterCurrency, context) : null;
    // A listing with no pricing rule has no price to compare and is not an
    // exchange-rate failure; only a quoted band that would not convert is.
    if (band !== null && normalized === null) unconvertible += 1;
    return {
      id: row.id,
      createdAt: row.createdAt.getTime(),
      band: normalized,
    };
  });

  if (unconvertible > 0) {
    console.warn(
      `[search] ${unconvertible} listing(s) could not be priced in ${filterCurrency}` +
        `${hasPriceBounds(bounds) ? " and were excluded from the price filter" : " and were sorted last"}`,
    );
  }

  return {
    orderedIds: orderPriceCandidates(candidates, bounds, sort),
    comparison: {
      currency: filterCurrency,
      applied: true,
      complete: unconvertible === 0,
      unconvertible,
    },
    nightlyRanges,
    stayPrices: stayPricing.rows,
  };
}

/** True when the price stage has to run at all: a bound to honour, or an order that
 *  is defined by price. */
function needsPriceScope(bounds: PriceBounds, sort: PriceSort): boolean {
  return hasPriceBounds(bounds) || sort !== "newest";
}

/** A comparison that never ran, for the searches that asked nothing of price. */
function inertPriceComparison(filters: SearchFilters): SearchPriceComparison {
  return {
    currency: filterCurrencyOf(filters),
    applied: false,
    complete: true,
    unconvertible: 0,
  };
}

/** ANDs an id restriction onto a `where` without touching whatever `AND` clauses
 *  `buildListingWhere` already put there. */
function restrictToIds(
  where: Prisma.ListingWhereInput,
  ids: string[],
): Prisma.ListingWhereInput {
  return { AND: [where, { id: { in: ids } }] };
}

/**
 * The same `where` with the price bounds honoured, for the facet queries.
 *
 * The bounds cannot be expressed in SQL any more — they are a comparison between
 * converted effective prices — so the only way a chip count can agree with the results
 * page is to resolve the price stage and hand the query the ids it produced. Returns
 * the `where` untouched when no bound was asked for, which is the common case and
 * costs nothing.
 */
async function withPriceBounds(
  where: Prisma.ListingWhereInput,
  filters: SearchFilters,
): Promise<Prisma.ListingWhereInput> {
  const bounds = normalizePriceBounds(filters.minPrice, filters.maxPrice);
  if (!hasPriceBounds(bounds)) return where;
  const scope = await resolvePriceScope(where, filters, bounds, "newest");
  return restrictToIds(where, scope.orderedIds);
}

export async function searchListings(filters: SearchFilters) {
  const page = Math.max(1, filters.page || 1);
  const skip = (page - 1) * ITEMS_PER_PAGE;
  const where = await buildListingWhere(filters);
  const bounds = normalizePriceBounds(filters.minPrice, filters.maxPrice);
  const sort = requestedSort(filters);

  // The price stage owns filtering, ordering *and* paging when it runs. Asking the
  // database for a page first and sorting that page is what made `sort=price_asc`
  // return twelve listings shuffled among themselves instead of the twelve cheapest.
  const scope = needsPriceScope(bounds, sort)
    ? await resolvePriceScope(where, filters, bounds, sort)
    : null;

  const { listings, total } = scope
    ? await readCardPage(scope.orderedIds, skip)
    : await readOrderedCardPage(where, skip);

  const listingIds = listings.map((l) => l.id);
  const stay = requestedStay(filters);

  const [videoUrls, cardPricing] = await Promise.all([
    getFirstVideoUrlsByListingIds(listingIds),
    // The price stage already computed both of these for every candidate; only the
    // discovery path, which never ran it, has to pay for the page's own.
    scope
      ? Promise.resolve({
          nightlyRanges: scope.nightlyRanges,
          stayPrices: scope.stayPrices,
        })
      : cardPricingFor(listings, stay),
  ]);

  return {
    listings: listings.map((l) =>
      serializeListingCard(
        l,
        videoUrls.get(l.id),
        cardPricing.stayPrices.get(l.id) ?? [],
        cardPricing.nightlyRanges.get(l.id) ?? null
      )
    ),
    total,
    page,
    totalPages: Math.ceil(total / ITEMS_PER_PAGE),
    priceComparison: scope ? scope.comparison : inertPriceComparison(filters),
  };
}

const cardSelectForSearch = {
  ...listingCardSelect,
  images: {
    where: { mediaType: "IMAGE" as const },
    select: { url: true, alt: true },
    orderBy: { displayOrder: "asc" as const },
    take: CARD_IMAGE_LIMIT,
  },
} satisfies Prisma.ListingSelect;

type SearchCardRow = Prisma.ListingGetPayload<{
  select: typeof cardSelectForSearch;
}>;

/** One page out of an order the price stage already decided. `findMany` answers in the
 *  database's order, so the ids are re-imposed on the result. */
async function readCardPage(orderedIds: string[], skip: number) {
  const pageIds = orderedIds.slice(skip, skip + ITEMS_PER_PAGE);
  const rows =
    pageIds.length > 0
      ? await db.listing.findMany({
          where: { id: { in: pageIds } },
          select: cardSelectForSearch,
        })
      : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return {
    listings: pageIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    }),
    total: orderedIds.length,
  };
}

/** Plain discovery: no price bound and no price order, so the database can page it.
 *  Ordered newest first *and then by id* — two listings created in the same
 *  millisecond otherwise come back in whatever order the planner chose, and a guest
 *  paging through them sees one twice and another never. */
async function readOrderedCardPage(
  where: Prisma.ListingWhereInput,
  skip: number,
): Promise<{ listings: SearchCardRow[]; total: number }> {
  const [listings, total] = await Promise.all([
    db.listing.findMany({
      where,
      select: cardSelectForSearch,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip,
      take: ITEMS_PER_PAGE,
    }),
    db.listing.count({ where }),
  ]);
  return { listings, total };
}

/** The override and range data one page of cards needs, for the discovery path. */
async function cardPricingFor(
  listings: SearchCardRow[],
  stay: { checkIn: Date; checkOut: Date } | null,
) {
  const listingIds = listings.map((l) => l.id);
  if (stay) {
    const { rows } = await stayOverridesByListing(listingIds, stay);
    return { nightlyRanges: new Map<string, NightlyRateRange>(), stayPrices: rows };
  }
  return {
    nightlyRanges: await getNightlyRateRangesForListings(rateRangeInputs(listings)),
    stayPrices: new Map<string, { date: string; rate: number }[]>(),
  };
}

const cardSelectWithImages = cardSelectForSearch;

/** Newest public listings. This is the honest default ordering for the home page —
 *  see getPopularListings for the demand-ranked one. */
export const getFeaturedListings = unstable_cache(
  async (limit = 6, excludeIds: string[] = []) => {
    const rows = await db.listing.findMany({
      where: {
        status: ListingStatus.APPROVED,
        availabilityMode: "OPEN",
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      },
      select: cardSelectWithImages,
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    const [videoUrls, nightlyRanges] = await Promise.all([
      getFirstVideoUrlsByListingIds(rows.map((r) => r.id)),
      getNightlyRateRangesForListings(rateRangeInputs(rows)),
    ]);
    return rows.map((r) =>
      serializeListingCard(r, videoUrls.get(r.id), [], nightlyRanges.get(r.id) ?? null)
    );
  },
  ["featured-listings"],
  { revalidate: HOME_LISTINGS_REVALIDATE_SECONDS, tags: [PUBLIC_HEADER_DATA_TAG] },
);

/**
 * Listings ranked by the demand signal computed in lib/services/popularity.service.ts.
 * Listings with a score of 0 have no signal yet and are excluded rather than filled in
 * with an arbitrary ordering — if this returns fewer rows than asked for, the caller
 * genuinely doesn't have enough data to label anything "popular".
 */
export const getPopularListings = unstable_cache(
  async (limit = 8) => {
    const rows = await db.listing.findMany({
      where: {
        status: ListingStatus.APPROVED,
        availabilityMode: "OPEN",
        popularityScore: { gt: 0 },
      },
      select: cardSelectWithImages,
      orderBy: [{ popularityScore: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    const [videoUrls, nightlyRanges] = await Promise.all([
      getFirstVideoUrlsByListingIds(rows.map((r) => r.id)),
      getNightlyRateRangesForListings(rateRangeInputs(rows)),
    ]);
    return rows.map((r) =>
      serializeListingCard(r, videoUrls.get(r.id), [], nightlyRanges.get(r.id) ?? null)
    );
  },
  ["popular-listings"],
  { revalidate: HOME_LISTINGS_REVALIDATE_SECONDS, tags: [PUBLIC_HEADER_DATA_TAG] },
);

/** Total publicly visible listings — drives how much of the home page is worth
 *  splitting into sections at all. */
export const countApprovedListings = unstable_cache(
  async () =>
    db.listing.count({
      where: { status: ListingStatus.APPROVED, availabilityMode: "OPEN" },
    }),
  ["approved-listing-count"],
  { revalidate: HOME_LISTINGS_REVALIDATE_SECONDS, tags: [PUBLIC_HEADER_DATA_TAG] },
);

/** Read on every /properties render. Identical to `getAmenityCatalog` in
 * amenity.service.ts, which was already cached — this one wasn't, so the same catalog
 * was being fetched fresh per search. Delegating keeps a single cached copy rather
 * than adding a second cache entry for the same rows. */
export async function getAvailableAmenities() {
  // The guest filter panel, not a host picker — so it carries the deactivated pets row
  // as well. Deactivating that row is what removed pets from the host's amenity list
  // once the policy column took over; leaving the guest filter to inherit that would
  // have quietly deleted a filter guests use, for a rule the listings still have.
  return getAmenityCatalogWithPetsFilter();
}

export async function getAvailableAmenityNames(filters: SearchFilters) {
  const where = await withPriceBounds(
    await buildListingWhere({
      ...filters,
      page: undefined,
      amenities: undefined,
    }),
    filters,
  );

  // Ask the DB for distinct amenity names directly instead of fetching every matching
  // listing's full amenity list and deduping in Node.
  const [rows, petsAllowed] = await Promise.all([
    db.amenity.findMany({
      where: { listings: { some: { listing: where } } },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    // The pets token has no amenity rows behind it any more, so its availability is a
    // question about the policy column. Asked separately rather than inferred, so the
    // chip is greyed out for exactly the same reason as every other one: nothing in this
    // result set has it.
    db.listing.count({ where: { ...where, petPolicy: "ALLOWED" }, take: 1 }),
  ]);

  return withPetsAllowed(
    rows.map((r) => r.name),
    petsAllowed > 0
  );
}

/** Adds the pets token to an available-amenity list when some matching listing allows
 *  pets. Sorted back into place so the filter panel's ordering is unchanged by where the
 *  answer came from. */
function withPetsAllowed(names: string[], allowed: boolean): string[] {
  if (!allowed || names.includes(PETS_ALLOWED_AMENITY_NAME)) return names;
  return [...names, PETS_ALLOWED_AMENITY_NAME].sort((a, b) => a.localeCompare(b));
}

export async function getAvailablePropertyTypes(filters: SearchFilters) {
  const where = await withPriceBounds(
    await buildListingWhere({
      ...filters,
      page: undefined,
      propertyTypes: undefined,
    }),
    filters,
  );

  const rows = await db.property.groupBy({
    by: ["propertyType"],
    where: { listings: { some: where } },
  });

  return collectAvailablePropertyTypes(rows.map((r) => r.propertyType));
}

export async function getSearchFilterPreview(
  filters: SearchFilters
): Promise<SearchFilterPreview> {
  const bounds = normalizePriceBounds(filters.minPrice, filters.maxPrice);
  // One price scope for all four facet counts.
  //
  // Every `where` below is the same search with one facet relaxed, so each is a subset
  // of this one, and a listing's effective price does not depend on its bedroom count,
  // its type or its amenities. Resolving the band once against the loosest of them and
  // intersecting gives every facet the same answer the results page will give — which
  // is the whole point: a chip that promises 8 homes and a page that then shows 5 is
  // the same disagreement in a smaller frame.
  const looseWhere = await buildListingWhere({
    ...filters,
    page: undefined,
    propertyTypes: undefined,
    amenities: undefined,
    bedrooms: undefined,
  });
  const scope = hasPriceBounds(bounds)
    ? await resolvePriceScope(looseWhere, filters, bounds, "newest")
    : null;
  const narrow = async (overrides: Partial<SearchFilters>) => {
    const where = await buildListingWhere({
      ...filters,
      page: undefined,
      ...overrides,
    });
    return scope ? restrictToIds(where, scope.orderedIds) : where;
  };

  const totalWhere = await narrow({});
  const propertyTypesWhere = await narrow({ propertyTypes: undefined });
  const amenitiesWhere = await narrow({ amenities: undefined });
  const bedroomsWhere = await narrow({ bedrooms: undefined });

  const [totalCount, propertyTypeRows, amenityRows, petsAllowedCount, bedroomStats] =
    await Promise.all([
      db.listing.count({ where: totalWhere }),
      db.property.groupBy({
        by: ["propertyType"],
        where: { listings: { some: propertyTypesWhere } },
      }),
      db.amenity.findMany({
        where: { listings: { some: { listing: amenitiesWhere } } },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
      // See `getAvailableAmenityNames`: the pets chip is backed by a column now, so its
      // availability is counted rather than joined.
      db.listing.count({ where: { ...amenitiesWhere, petPolicy: "ALLOWED" }, take: 1 }),
      db.listing.aggregate({
        where: bedroomsWhere,
        _max: {
          bedrooms: true,
        },
      }),
    ]);

  return {
    totalCount,
    availablePropertyTypes: await collectAvailablePropertyTypes(
      propertyTypeRows.map((r) => r.propertyType)
    ),
    availableAmenities: withPetsAllowed(
      amenityRows.map((r) => r.name),
      petsAllowedCount > 0
    ),
    maxBedrooms: bedroomStats._max.bedrooms ?? 0,
    priceComparison: scope ? scope.comparison : inertPriceComparison(filters),
  };
}

// Read on every public page (the header's location/type autocomplete), so this is
// cached rather than hitting the DB per navigation — bounded by a 5 minute fallback and
// invalidated on-demand when a listing's approval/suspension status changes.
export const getAvailableCities = unstable_cache(
  async (): Promise<PlaceOption[]> => {
    const properties = await db.property.findMany({
      // Closed-by-default listings still contribute their place to autocomplete:
      // otherwise a guest could never form the dated search that reveals them.
      where: { listings: { some: { status: ListingStatus.APPROVED } } },
      select: { city: true, country: true },
      distinct: ["city", "country"],
      orderBy: [{ city: "asc" }, { country: "asc" }],
    });
    const seen = new Set<string>();
    const result: PlaceOption[] = [];

    for (const p of properties) {
      const city = p.city.trim();
      const country = p.country.trim();
      if (!city) continue;

      const key = placeKey({ city, country });
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ city, country });
    }

    return result;
  },
  ["available-cities"],
  { revalidate: 300, tags: [PUBLIC_HEADER_DATA_TAG] }
);

export const getAvailablePropertyTypesByCity = unstable_cache(
  async (): Promise<Record<string, string[]>> => {
    // Distinct (city, country, propertyType) rows computed by the DB instead of
    // fetching every approved property and deduping in Node. Keyed by `placeKey` (not
    // bare city) so two same-named cities in different countries don't merge lists.
    const rows = await db.property.groupBy({
      by: ["city", "country", "propertyType"],
      where: { listings: { some: { status: ListingStatus.APPROVED } } },
    });

    const canonicalKeyByLookup = new Map<string, string>();
    const propertyTypesByKey = new Map<string, string[]>();

    for (const row of rows) {
      const city = row.city.trim();
      const country = row.country.trim();
      if (!city) continue;

      const place = { city, country };
      const lookup = placeKey(place);
      const canonicalKey = canonicalKeyByLookup.get(lookup) ?? lookup;
      canonicalKeyByLookup.set(lookup, canonicalKey);

      const current = propertyTypesByKey.get(canonicalKey) ?? [];
      current.push(row.propertyType);
      propertyTypesByKey.set(canonicalKey, current);
    }

    const entries = await Promise.all(
      [...propertyTypesByKey.entries()].map(
        async ([key, propertyTypes]) =>
          [key, await collectAvailablePropertyTypes(propertyTypes)] as const
      )
    );
    return Object.fromEntries(entries);
  },
  ["available-property-types-by-city"],
  { revalidate: 300, tags: [PUBLIC_HEADER_DATA_TAG] }
);

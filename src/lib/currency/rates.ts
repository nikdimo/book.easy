import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { SUPPORTED_CURRENCY_CODES, isSupportedCurrency } from "@/lib/currency/currencies";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";

/** Invalidated by the admin action that forces a refresh; see
 *  lib/actions/currency.actions.ts. */
export const EXCHANGE_RATES_TAG = "exchange-rates";

/**
 * Rates are quoted daily by the provider, so refetching more often buys nothing.
 * Six hours keeps a same-day correction from taking until tomorrow to appear while
 * still amounting to four upstream calls a day for the whole site — the story's
 * "must not make a separate exchange-rate request for every visible property" is
 * satisfied structurally: the table is fetched once and every price on the page
 * converts against the copy already in memory.
 */
const RATES_REVALIDATE_SECONDS = 60 * 60 * 6;

/** How long a stored snapshot may keep serving after the provider starts failing.
 *  Beyond this the rates are too old to present as a price, and display falls back
 *  to the listing's official currency instead of showing a stale conversion. */
const SNAPSHOT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

const PROVIDER_URL =
  process.env.EXCHANGE_RATE_API_URL ?? `https://open.er-api.com/v6/latest/${BASE_CURRENCY}`;

const FETCH_TIMEOUT_MS = 8000;

export interface RateTable {
  /** Always `BASE_CURRENCY`. Every multiplier converts one unit of base into the
   *  keyed currency. */
  base: string;
  rates: Readonly<Record<string, number>>;
  /** When the provider published these rates. Surfaced in the UI disclosure. */
  fetchedAt: string;
  provider: string;
  /** True when the provider is unreachable and this is a stored snapshot. Prices
   *  still render; the difference matters only for what the UI discloses. */
  stale: boolean;
}

interface ProviderPayload {
  rates?: unknown;
  conversion_rates?: unknown;
  base?: unknown;
  base_code?: unknown;
  result?: unknown;
  time_last_update_unix?: unknown;
  date?: unknown;
}

/**
 * Accepts the two shapes the common providers return — open.er-api / exchangerate-api
 * (`conversion_rates` or `rates` plus `base_code`) and the ECB-style
 * frankfurter/exchangerate.host (`rates` plus `base`/`date`) — so the provider can be
 * swapped through `EXCHANGE_RATE_API_URL` without a code change.
 *
 * Everything is validated rather than trusted. A rate that is zero, negative,
 * non-finite or non-numeric is dropped, not coerced: a corrupted entry that reached
 * the formatter would render a listing as free, which is worse in every way than
 * that currency being temporarily unavailable.
 */
function parseProviderPayload(payload: ProviderPayload): Omit<RateTable, "stale"> | null {
  if (typeof payload.result === "string" && payload.result !== "success") return null;

  const base = payload.base_code ?? payload.base ?? BASE_CURRENCY;
  if (typeof base !== "string" || base.toUpperCase() !== BASE_CURRENCY) {
    // A table quoted against something else would silently invert every price.
    return null;
  }

  const raw = payload.conversion_rates ?? payload.rates;
  if (!raw || typeof raw !== "object") return null;

  const rates: Record<string, number> = { [BASE_CURRENCY]: 1 };
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    const upper = code.toUpperCase();
    if (!isSupportedCurrency(upper)) continue;
    const rate = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    rates[upper] = rate;
  }

  // One usable currency is the base itself, which proves nothing about the payload.
  if (Object.keys(rates).length < 2) return null;

  const publishedAt =
    typeof payload.time_last_update_unix === "number"
      ? new Date(payload.time_last_update_unix * 1000)
      : typeof payload.date === "string" && !Number.isNaN(Date.parse(payload.date))
        ? new Date(payload.date)
        : new Date();

  return {
    base: BASE_CURRENCY,
    rates,
    fetchedAt: publishedAt.toISOString(),
    provider: new URL(PROVIDER_URL).host,
  };
}

async function fetchFromProvider(): Promise<Omit<RateTable, "stale"> | null> {
  try {
    const response = await fetch(PROVIDER_URL, {
      // This function is already wrapped in `unstable_cache`, which owns the caching
      // policy. Letting fetch cache too would give the table a second, different
      // lifetime and make a forced refresh silently return the same numbers.
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return parseProviderPayload((await response.json()) as ProviderPayload);
  } catch {
    // Unreachable, timed out, or not JSON. The caller falls back to the snapshot.
    return null;
  }
}

async function storeSnapshot(table: Omit<RateTable, "stale">): Promise<void> {
  try {
    await db.exchangeRateSnapshot.upsert({
      where: { id: "current" },
      create: {
        id: "current",
        base: table.base,
        rates: table.rates,
        provider: table.provider,
        fetchedAt: new Date(table.fetchedAt),
      },
      update: {
        base: table.base,
        rates: table.rates,
        provider: table.provider,
        fetchedAt: new Date(table.fetchedAt),
      },
    });
  } catch (error) {
    // The snapshot is a resilience measure, not the read path. Failing to write it
    // must never take down the fresh rates we already have in hand.
    console.warn("[currency] could not store exchange-rate snapshot", error);
  }
}

async function readSnapshot(): Promise<RateTable | null> {
  try {
    const row = await db.exchangeRateSnapshot.findUnique({ where: { id: "current" } });
    if (!row || row.base !== BASE_CURRENCY) return null;
    if (Date.now() - row.fetchedAt.getTime() > SNAPSHOT_MAX_AGE_MS) return null;

    const rates: Record<string, number> = { [BASE_CURRENCY]: 1 };
    for (const [code, value] of Object.entries(row.rates as Record<string, unknown>)) {
      const rate = typeof value === "number" ? value : Number(value);
      if (isSupportedCurrency(code) && Number.isFinite(rate) && rate > 0) {
        rates[code] = rate;
      }
    }
    if (Object.keys(rates).length < 2) return null;

    return {
      base: row.base,
      rates,
      fetchedAt: row.fetchedAt.toISOString(),
      provider: row.provider,
      stale: true,
    };
  } catch (error) {
    console.warn("[currency] could not read exchange-rate snapshot", error);
    return null;
  }
}

/**
 * The one place rates enter the application.
 *
 * Returns null only when the provider is down *and* there is no usable snapshot —
 * at which point callers show the listing's official currency rather than a guess.
 * A null here is a display decision, never a pricing one: nothing downstream of
 * this function can change a stored or payable amount.
 */
export const getExchangeRates = unstable_cache(
  async (): Promise<RateTable | null> => {
    const fresh = await fetchFromProvider();
    if (fresh) {
      await storeSnapshot(fresh);
      return { ...fresh, stale: false };
    }
    return readSnapshot();
  },
  ["exchange-rates"],
  { revalidate: RATES_REVALIDATE_SECONDS, tags: [EXCHANGE_RATES_TAG] },
);

/** The subset of the catalog that can actually be displayed right now. The picker
 *  lists these; a currency the provider has stopped quoting disappears from the
 *  list rather than becoming a broken selection. */
export function quotableCurrencies(table: RateTable | null): string[] {
  if (!table) return [BASE_CURRENCY];
  return SUPPORTED_CURRENCY_CODES.filter((code) => code in table.rates);
}

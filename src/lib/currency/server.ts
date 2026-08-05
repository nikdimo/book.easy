import "server-only";
import { cookies } from "next/headers";
import {
  DEFAULT_DISPLAY_CURRENCY,
  DISPLAY_CURRENCY_COOKIE,
  normalizeCurrencyCode,
} from "@/lib/currency/currency-preference";

/**
 * The display currency for the request being handled.
 *
 * Reads only the cookie, because by the time any page renders the proxy has already
 * done the resolving — it merges the cookie, the signed-in account's stored value
 * and IP detection, then writes the winner back onto the request's own cookie
 * header. That ordering is what makes the first paint correct: the server renders
 * prices in the right currency, so nothing has to be corrected after hydration and
 * there is no visible EUR-then-DKK flip.
 *
 * Falls back to the base currency outside a request context (build-time rendering,
 * background jobs), where conversion is neither possible nor wanted.
 */
export async function getDisplayCurrency(): Promise<string> {
  try {
    const store = await cookies();
    return (
      normalizeCurrencyCode(store.get(DISPLAY_CURRENCY_COOKIE)?.value) ??
      DEFAULT_DISPLAY_CURRENCY
    );
  } catch {
    return DEFAULT_DISPLAY_CURRENCY;
  }
}

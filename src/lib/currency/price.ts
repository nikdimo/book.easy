import "server-only";
import { cache } from "react";
import type { Decimal } from "@prisma/client/runtime/library";
import { getDisplayCurrency } from "@/lib/currency/server";
import { getExchangeRates } from "@/lib/currency/rates";
import { getLocale } from "@/lib/i18n/t";
import {
  displayPrice,
  formatMoney,
  type ConversionContext,
  type DisplayPrice,
} from "@/lib/currency/convert";

export type Money = number | string | Decimal;

/** Prices arrive from Prisma as `Decimal`, from JSON payloads as strings, and from
 *  pricing maths as numbers. Normalising here keeps every call site from repeating
 *  the same three-way check. */
function toNumber(amount: Money): number {
  if (typeof amount === "number") return amount;
  if (typeof amount === "string") return Number.parseFloat(amount);
  return amount.toNumber();
}

export interface PriceFormatter {
  /** The currency the guest is browsing in. */
  currency: string;
  /** The catalog locale, used for separators and symbol placement. */
  locale: string;
  /** False when rates are unavailable, so nothing on the page is converted and the
   *  UI shows its "prices are in the property's official currency" notice. */
  canConvert: boolean;
  /** When the rates in use were published, or null when nothing is being converted. */
  ratesUpdatedAt: string | null;
  /** True when the provider is unreachable and stored rates are being used. */
  stale: boolean;
  /** Formats one amount for display: converted where possible, official otherwise.
   *  `exact` keeps the currency's minor units on a whole amount, for the price
   *  details; everything else drops a fraction that would only print zeros. */
  format(
    amount: Money,
    officialCurrency: string,
    options?: { exact?: boolean },
  ): DisplayPrice;
  /** Formats an amount in its official currency, never converted. For anything that
   *  states what a guest actually owes or a host actually receives. */
  formatOfficial(
    amount: Money,
    officialCurrency: string,
    options?: { exact?: boolean },
  ): string;
  /** The serialisable slice handed to `DisplayCurrencyProvider` so client components
   *  format identically to the server render. */
  context: ConversionContext | null;
}

/**
 * The single entry point for rendering guest-facing prices on the server.
 *
 * Scoped to the request with React's `cache`, so a page rendering two hundred
 * property cards resolves the currency and the rate table exactly once and every
 * card converts against the same in-memory copy — the story's "must not call the
 * exchange-rate provider separately for every property" is a property of this
 * design rather than something to remember at each call site.
 *
 * Conversion is display-only by construction: this module reads prices, and there
 * is no path from here back into anything stored, quoted or charged.
 */
export const getPriceFormatter = cache(async (): Promise<PriceFormatter> => {
  const [currency, locale] = await Promise.all([getDisplayCurrency(), getLocale()]);

  // Fetched even when the display currency is the base one: a listing may be priced
  // in something else, and that still needs converting *into* the base. The call is
  // effectively free — `getExchangeRates` is cached for hours, so this is a memory
  // read on all but a handful of requests a day.
  const table = await getExchangeRates();
  const context: ConversionContext | null = table
    ? { display: currency, rates: table.rates }
    : null;

  return {
    currency,
    locale,
    canConvert: context !== null,
    ratesUpdatedAt: table?.fetchedAt ?? null,
    stale: table?.stale ?? false,
    context,
    format: (amount, officialCurrency, options) =>
      displayPrice(toNumber(amount), officialCurrency, locale, context, {
        exact: options?.exact ?? false,
      }),
    formatOfficial: (amount, officialCurrency, options) =>
      formatMoney(toNumber(amount), officialCurrency, locale, {
        exact: options?.exact ?? false,
      }),
  };
});

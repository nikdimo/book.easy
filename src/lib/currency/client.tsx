"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  convertAmount,
  displayPrice,
  formatMoney,
  type ConversionContext,
  type DisplayPrice,
} from "@/lib/currency/convert";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";

interface DisplayCurrencyValue {
  /** The currency the guest is browsing in. */
  currency: string;
  locale: string;
  /** False when rates are unavailable and everything falls back to official prices. */
  canConvert: boolean;
  ratesUpdatedAt: string | null;
  stale: boolean;
  format(amount: number | string, officialCurrency: string): DisplayPrice;
  /** The converted number without any formatting, for the few places that must lay a
   * price out themselves — a calendar cell drops the symbol to fit seven of them
   * across a phone. Null where `format` would have fallen back to the official
   * amount, so callers render that instead. */
  convert(amount: number, officialCurrency: string): number | null;
}

/**
 * Base currency, no conversion. Used outside the provider — host and admin surfaces
 * deliberately never mount it, because everything they show is an official amount
 * that must not be converted.
 */
const FALLBACK: DisplayCurrencyValue = {
  currency: BASE_CURRENCY,
  locale: "en",
  canConvert: false,
  ratesUpdatedAt: null,
  stale: false,
  format: (amount, officialCurrency) => ({
    text: formatMoney(
      typeof amount === "string" ? Number.parseFloat(amount) : amount,
      officialCurrency,
      "en",
    ),
    currency: officialCurrency,
    converted: false,
  }),
  convert: () => null,
};

const DisplayCurrencyContext = createContext<DisplayCurrencyValue>(FALLBACK);

/**
 * Seeded from the server render, so a client component formats a price exactly the
 * way the server just did — anything else is a hydration mismatch on every price on
 * the page. Changing currency re-runs the server render through `router.refresh()`,
 * which hands this new props without remounting the tree below it, so live client
 * state (map viewport, open dialogs, half-filled booking forms) survives the change.
 */
export function DisplayCurrencyProvider({
  currency,
  locale,
  context,
  ratesUpdatedAt,
  stale,
  children,
}: {
  currency: string;
  locale: string;
  /** Null when rates are unavailable; prices then render in official currency. */
  context: ConversionContext | null;
  ratesUpdatedAt: string | null;
  stale: boolean;
  children: ReactNode;
}) {
  const value = useMemo<DisplayCurrencyValue>(
    () => ({
      currency,
      locale,
      canConvert: context !== null,
      ratesUpdatedAt,
      stale,
      format: (amount, officialCurrency) =>
        displayPrice(
          typeof amount === "string" ? Number.parseFloat(amount) : amount,
          officialCurrency,
          locale,
          context,
        ),
      convert: (amount, officialCurrency) =>
        context && context.display !== officialCurrency
          ? convertAmount(amount, officialCurrency, context)
          : null,
    }),
    [currency, locale, context, ratesUpdatedAt, stale],
  );

  return (
    <DisplayCurrencyContext.Provider value={value}>
      {children}
    </DisplayCurrencyContext.Provider>
  );
}

export function useDisplayCurrency(): DisplayCurrencyValue {
  return useContext(DisplayCurrencyContext);
}

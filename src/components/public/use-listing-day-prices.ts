"use client";

import { useCallback, useMemo } from "react";
import { useDisplayCurrency } from "@/lib/currency/client";
import { currencySymbol } from "@/lib/currency/currencies";
import {
  computeDayRate,
  dateKey,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";

export interface ListingDayPrice {
  /** What this night costs, formatted for the cell. */
  sublabel: string;
  /** Set only when a promotion actually lowers this night — the price it was struck
   * down from. */
  sublabelOriginal?: string;
  /** Drives the accent tone: this night is not simply the base rate. */
  isCustomPrice: boolean;
}

export function boundedCalendarPromotions(
  promotions: StayPromotion[] | undefined,
): StayPromotion[] | undefined {
  if (!promotions) return undefined;
  return promotions.filter((promotion) => {
    if (promotion.startDate == null || promotion.endDate == null) return false;
    const start = new Date(promotion.startDate).getTime();
    const end = new Date(promotion.endDate).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && start < end;
  });
}

/**
 * Per-night prices for the guest-facing calendars.
 *
 * Cells drop the currency symbol: seven of them have to fit across a phone, and the
 * widget above the calendar already says which currency the listing sells in. The
 * amount is still converted into the guest's display currency, so the calendar and
 * the price breakdown never disagree about what a night costs.
 */
export function useListingDayPrices({
  baseNightlyRate,
  currency,
  priceOverrides,
  promotions,
  boundedPromotionsOnly = false,
  showCurrencySymbol = false,
}: {
  baseNightlyRate: number;
  currency: string;
  priceOverrides: { date: string; rate: number }[];
  promotions?: StayPromotion[];
  /** Listing-page cards only advertise discounts with a concrete date window.
   * Compact guest pickers retain their existing promotion behavior. */
  boundedPromotionsOnly?: boolean;
  /** Roomier card calendars can identify the display currency without a legend. */
  showCurrencySymbol?: boolean;
}): (day: Date) => ListingDayPrice | undefined {
  const display = useDisplayCurrency();

  const overrides = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of priceOverrides) map.set(row.date, row.rate);
    return map;
  }, [priceOverrides]);

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(display.locale, {
        maximumFractionDigits: 0,
      }),
    [display.locale],
  );

  const formatRate = useCallback(
    (rate: number) => {
      const converted = display.convert(rate, currency);
      const value = converted ?? rate;
      if (!showCurrencySymbol) return formatter.format(value);
      // Calendar cells deliberately use a stable prefix form ("€90", "kr90").
      // Locale-aware currency formatters can swap the symbol from one side to the
      // other between the server seed and a restored browser preference, which is
      // both wider and a hydration mismatch in this very small surface.
      const renderedCurrency = converted == null ? currency : display.currency;
      return `${currencySymbol(renderedCurrency, "en")}${formatter.format(value)}`;
    },
    [
      currency,
      display,
      formatter,
      showCurrencySymbol,
    ],
  );

  const cellPromotions = useMemo(
    () =>
      boundedPromotionsOnly
        ? boundedCalendarPromotions(promotions)
        : promotions,
    [boundedPromotionsOnly, promotions],
  );

  return useCallback(
    (day: Date) => {
      if (!Number.isFinite(baseNightlyRate)) return undefined;
      const { rate, originalRate } = computeDayRate({
        baseNightly: baseNightlyRate,
        overrides,
        day,
        promotions: cellPromotions,
      });

      return {
        sublabel: formatRate(rate),
        sublabelOriginal:
          originalRate != null ? formatRate(originalRate) : undefined,
        isCustomPrice: overrides.has(dateKey(day)) || originalRate != null,
      };
    },
    [baseNightlyRate, overrides, cellPromotions, formatRate],
  );
}

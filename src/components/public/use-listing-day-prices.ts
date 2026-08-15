"use client";

import { useCallback, useMemo } from "react";
import { useDisplayCurrency } from "@/lib/currency/client";
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
}: {
  baseNightlyRate: number;
  currency: string;
  priceOverrides: { date: string; rate: number }[];
  promotions?: StayPromotion[];
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
    (rate: number) => formatter.format(display.convert(rate, currency) ?? rate),
    [display, currency, formatter],
  );

  return useCallback(
    (day: Date) => {
      if (!Number.isFinite(baseNightlyRate)) return undefined;
      const { rate, originalRate } = computeDayRate({
        baseNightly: baseNightlyRate,
        overrides,
        day,
        promotions,
      });

      return {
        sublabel: formatRate(rate),
        sublabelOriginal:
          originalRate != null ? formatRate(originalRate) : undefined,
        isCustomPrice: overrides.has(dateKey(day)) || originalRate != null,
      };
    },
    [baseNightlyRate, overrides, promotions, formatRate],
  );
}

"use client";

import { useCallback, useMemo } from "react";
import { useDisplayCurrency } from "@/lib/currency/client";
import { interpolate, useI18n } from "@/lib/i18n/client";
import type { Resolved } from "@/lib/i18n/t";
import { currencySymbol } from "@/lib/currency/currencies";
import {
  computeDayRate,
  dateKey,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";

/** A calendar cell is a seventh of a month, and what it has to say is the price. A
 *  symbol of one or two characters ("€", "kr", "лв") rides along in front of the
 *  amount; three and up — "MKD", "CHF", XPF's "CFPF" — is a word competing with the
 *  number for the same few pixels, and gets dropped. */
const MAX_CELL_SYMBOL_CHARS = 2;

/**
 * What a calendar cell puts in front of the amount: the currency's symbol when it is
 * short enough to ride along ("€", "kr", "zł"), and nothing when it is not. The
 * booking widget above the calendar names the currency either way.
 */
export function calendarCurrencyPrefix(code: string): string {
  const symbol = currencySymbol(code, "en");
  return symbol.length > MAX_CELL_SYMBOL_CHARS ? "" : symbol;
}

/**
 * The currency the cells are actually quoting: the guest's display currency wherever
 * a rate exists for it, and the listing's own where none does. Whether a rate can be
 * had is a property of the currency pair, not of any one night, so one probe answers
 * for the whole calendar.
 */
export function useCellCurrency(currency: string): string {
  const display = useDisplayCurrency();
  return display.convert(1, currency) == null ? currency : display.currency;
}

/**
 * "Prices in MKD" — the line under a calendar whose cells cannot say it themselves.
 *
 * Most currencies have no symbol worth the width of a cell (see
 * `calendarCurrencyPrefix`), and the ones that do are not unambiguous: "kr" is three
 * different Nordic currencies. Naming it once below the grid costs a line and settles
 * both cases.
 */
export function useCellCurrencyNote(currency: string): Resolved {
  const i18n = useI18n();
  const shown = useCellCurrency(currency);
  return interpolate(
    i18n.resolve("listing.calendar_prices_in", "Prices in {currency}"),
    { currency: shown },
  );
}

/** Where a cell stops spelling an amount out. A night at 1,500,000 rupiah is nine
 *  characters in a cell that is a seventh of a month; to the nearest thousand it is
 *  four, and a guest scanning a grid for what a night costs is reading the size of
 *  the number, not its last three digits. The widget still prices the stay exactly. */
const COMPACT_FROM = 100_000;

const cellFormatters = new Map<
  string,
  { plain: Intl.NumberFormat; fractional: Intl.NumberFormat }
>();

function formattersFor(locale: string) {
  const cached = cellFormatters.get(locale);
  if (cached) return cached;
  const pair = {
    plain: new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    fractional: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
  };
  cellFormatters.set(locale, pair);
  return pair;
}

/**
 * An amount as a calendar cell says it: every digit up to six figures, then "150K"
 * and "1.5M".
 *
 * The suffix is fixed rather than `Intl`'s compact notation, which is locale-aware to
 * a fault on this surface — a million is "1,5 мил." in Macedonian and "1,5 Mio." in
 * German, wider than the number it set out to shorten. The digits and the decimal
 * mark still come from the reader's locale.
 */
export function formatCellAmount(value: number, locale: string): string {
  const { plain, fractional } = formattersFor(locale);
  if (value < COMPACT_FROM) return plain.format(value);
  const thousands = Math.round(value / 1_000);
  return thousands < 1_000
    ? `${plain.format(thousands)}K`
    : `${fractional.format(value / 1_000_000)}M`;
}

export interface ListingDayPrice {
  /** What this night costs, formatted for the cell. */
  sublabel: string;
  /** The currency symbol `sublabel` (and `sublabelOriginal`) begins with, when it
   * carries one. Named on its own so a cell can set it a size down and let the
   * amount be the thing that reads. */
  sublabelSymbol?: string;
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
 * Everything here is in service of seven prices fitting across a phone: only the
 * roomiest cells carry a currency symbol at all, and only a symbol worth the room
 * (`calendarCurrencyPrefix`); six-figure amounts are shortened (`formatCellAmount`).
 * The widget above the calendar says which currency the listing sells in and prices
 * the stay exactly. The amount is still converted into the guest's display currency,
 * so the calendar and the price breakdown never disagree about what a night costs.
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

  // Calendar cells deliberately use a stable prefix form ("€90", "kr90"). Locale-aware
  // currency formatters can swap the symbol from one side to the other between the
  // server seed and a restored browser preference, which is both wider and a hydration
  // mismatch in this very small surface. Whether a rate converts at all is a property
  // of the currency pair rather than of the night, so every cell in the calendar
  // carries the same symbol — resolved once, here.
  const cellCurrency = useCellCurrency(currency);
  const cellSymbol = useMemo(
    () =>
      showCurrencySymbol
        ? calendarCurrencyPrefix(cellCurrency) || undefined
        : undefined,
    [cellCurrency, showCurrencySymbol],
  );

  const formatRate = useCallback(
    (rate: number) => {
      const value = display.convert(rate, currency) ?? rate;
      return `${cellSymbol ?? ""}${formatCellAmount(value, display.locale)}`;
    },
    [cellSymbol, currency, display],
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
        sublabelSymbol: cellSymbol,
        sublabelOriginal:
          originalRate != null ? formatRate(originalRate) : undefined,
        isCustomPrice: overrides.has(dateKey(day)) || originalRate != null,
      };
    },
    [baseNightlyRate, cellSymbol, overrides, cellPromotions, formatRate],
  );
}

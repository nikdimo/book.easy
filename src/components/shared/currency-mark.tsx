"use client";

import { Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDisplayCurrency } from "@/lib/currency/client";
import { currencySymbol } from "@/lib/currency/currencies";

/** Beyond three characters a symbol stops reading as a mark and starts reading as a
 *  cramped word — and it would be sitting right next to the three-letter code anyway. */
const MAX_SYMBOL_LENGTH = 3;

/**
 * Sizes are owned here rather than passed in as classes, because the two branches need
 * different boxes: the banknote is an icon and wants a square, while a mark wants a
 * fixed height and a free width so "kr" and "ден" are not squeezed into one. Both keep
 * the same minimum width so the header column does not shift when the currency changes.
 */
const SIZES = {
  /** The regional trigger in the site header, beside the globe. */
  header: {
    icon: "size-[18px] lg:size-5",
    mark: "h-[18px] min-w-[18px] lg:h-5 lg:min-w-5",
    text: {
      1: "text-[1.1875rem] lg:text-[1.3125rem]",
      2: "text-[0.8125rem] lg:text-[0.875rem]",
      3: "text-[0.6875rem] lg:text-[0.75rem]",
    },
  },
  /** A dropdown menu row, beside the other 16px item icons. */
  menu: {
    icon: "size-4",
    mark: "h-4 min-w-4",
    text: {
      1: "text-[1.0625rem]",
      2: "text-[0.75rem]",
      3: "text-[0.625rem]",
    },
  },
} as const;

/**
 * The currency's own symbol — €, $, £, kr, ден — rendered at icon size, falling back
 * to a banknote when there is no symbol to show.
 *
 * "No symbol to show" is a real and common case, not an edge one: `Intl` returns the
 * bare code for currencies that have no distinct sign in the reading language, and
 * rendering that would print "AED AED" beside the code it sits next to.
 *
 * The symbol comes from the same locale that formats every price on the page, so the
 * header cannot advertise one sign while the prices below it print another.
 */
export function CurrencyMark({
  currency,
  size = "menu",
  className,
}: {
  /** ISO 4217 code. Defaults to the currency being browsed in. */
  currency?: string;
  size?: keyof typeof SIZES;
  /** Extra classes — margins and colour, not sizing. */
  className?: string;
}) {
  const display = useDisplayCurrency();
  const code = currency ?? display.currency;
  const raw = currencySymbol(code, display.locale);
  // Some locales write the sign as an abbreviation — "ден." for MKD in Macedonian,
  // "р." for BYN. The period is punctuation for running text, not part of the mark,
  // and keeping it would push a perfectly good three-character sign over the limit.
  const symbol = raw.replace(/\.$/, "").trim();
  // `currencySymbol` returns the code itself when the locale has no sign for it.
  const usable =
    symbol.length > 0 && symbol !== code && symbol.length <= MAX_SYMBOL_LENGTH;
  const sizing = SIZES[size];

  if (!usable) {
    return <Banknote className={cn(sizing.icon, className)} aria-hidden />;
  }

  return (
    <span
      aria-hidden
      translate="no"
      // Google Translate rewrites text nodes before React hydrates, and `Intl` can
      // resolve a symbol slightly differently on the server than in the browser.
      // Neither is worth a hydration error over a single glyph.
      suppressHydrationWarning
      className={cn(
        "notranslate inline-flex shrink-0 items-center justify-center leading-none",
        sizing.mark,
        sizing.text[symbol.length as 1 | 2 | 3] ?? sizing.text[3],
        className,
      )}
    >
      {symbol}
    </span>
  );
}

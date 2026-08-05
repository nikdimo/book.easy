"use client";

import { cn } from "@/lib/utils";
import { useDisplayCurrency } from "@/lib/currency/client";
import { formatMoney } from "@/lib/currency/convert";

/**
 * One price, converted into the guest's display currency where possible and shown
 * in the listing's official currency where not.
 *
 * A client component so that it re-formats from context, but every one of its props
 * is serialisable and server components render it unchanged. `suppressHydrationWarning`
 * stays for the same reason it always has: Google Translate rewrites price text nodes
 * in the DOM before React hydrates.
 */
export function LocalizedPrice({
  amount,
  currency = "EUR",
  locale,
  className,
  official = false,
}: {
  amount: number | string;
  /** The listing's official currency — what the amount is denominated in, not what
   *  it will be displayed in. */
  currency?: string;
  /** Overrides the reading locale used for separators and symbol placement. Server
   *  components pass the catalog locale they already resolved; everything else can
   *  omit it and take the same value from context. */
  locale?: string;
  className?: string;
  /** Set on amounts that state what someone owes or receives, which must never be
   *  converted: the payable total on checkout, host payouts, official email figures. */
  official?: boolean;
}) {
  const display = useDisplayCurrency();
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  const text = official
    ? formatMoney(value, currency, locale ?? display.locale)
    : display.format(amount, currency).text;

  return (
    <span
      className={cn("notranslate", className)}
      translate="no"
      suppressHydrationWarning
    >
      {text}
    </span>
  );
}

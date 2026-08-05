"use client";

import { useDisplayCurrency } from "@/lib/currency/client";
import { formatMoney } from "@/lib/currency/convert";
import { useI18n, interpolate } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Names the currency the booking is actually agreed in, next to a total the guest
 * is reading in some other one.
 *
 * Renders nothing when the two currencies are the same, which is the common case —
 * there is no ambiguity to resolve, and a permanent "prices are in EUR" line under
 * a price already labelled EUR is noise.
 *
 * The story is unambiguous that this must never be left implied: a converted total
 * is a convenience, and the host expects a specific amount in a specific currency.
 */
export function OfficialAmountNotice({
  amount,
  officialCurrency,
  className,
}: {
  amount: number | string;
  officialCurrency: string;
  className?: string;
}) {
  const display = useDisplayCurrency();
  const i18n = useI18n();
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount;

  // `converted` is false both when the guest browses in the official currency and
  // when no rate was available — in either case what they are looking at already is
  // the official amount, and there is nothing to disclose.
  if (!display.format(amount, officialCurrency).converted) return null;

  const notice = interpolate(
    i18n.resolve(
      "booking.official_currency_notice",
      "Prices are displayed in {display} for convenience. The booking is agreed in {official}: {amount}.",
    ),
    {
      display: display.currency,
      official: officialCurrency,
      amount: formatMoney(value, officialCurrency, display.locale),
    },
  );

  return (
    <p
      className={cn("text-xs text-muted-foreground", className)}
      // The amounts inside are already locale-formatted; Google Translate rewriting
      // them would produce a different number than the one that will be charged.
      translate="no"
    >
      <span className={notice.translated ? "notranslate" : undefined}>
        {notice.text}
      </span>
    </p>
  );
}

import { convertAmount, formatMoney, type ConversionContext } from "@/lib/currency/convert";

export interface UpcomingBookingAmount {
  currency: string;
  amount: number;
}

export interface UpcomingTotalSummary {
  text: string;
  /** True once the figure required converting at least one booking's official
   *  currency into the host's own display currency — an estimate at today's rate,
   *  never the guaranteed amount, so the caller must mark it visibly. */
  approximate: boolean;
}

/**
 * One headline figure for "upcoming" bookings, even when a host's listings are
 * priced in more than one currency.
 *
 * The headline follows the host's selected display currency, even when all of the
 * underlying bookings happen to share some other currency. It stays exact only when
 * every booking is already in that display currency. Otherwise it is converted at
 * today's browsing rate and visibly marked as an estimate. If the rate provider is
 * unreachable or cannot quote one of the currencies involved, amounts in different
 * currencies are never added together as if they were the same number; each
 * currency's own real total is shown instead, joined rather than blended.
 */
export function summarizeUpcomingTotal(
  bookings: readonly UpcomingBookingAmount[],
  fallbackCurrency: string,
  locale: string,
  context: ConversionContext | null,
): UpcomingTotalSummary {
  if (bookings.length === 0) {
    return { text: formatMoney(0, fallbackCurrency, locale), approximate: false };
  }

  const currencies = new Set(bookings.map((booking) => booking.currency));
  const displayCurrency = context?.display ?? fallbackCurrency;
  if (currencies.size === 1 && currencies.has(displayCurrency)) {
    const total = bookings.reduce((sum, booking) => sum + booking.amount, 0);
    return { text: formatMoney(total, displayCurrency, locale), approximate: false };
  }

  if (context) {
    let convertedTotal = 0;
    let fullyConverted = true;
    for (const booking of bookings) {
      if (booking.currency === context.display) {
        convertedTotal += booking.amount;
        continue;
      }
      const converted = convertAmount(booking.amount, booking.currency, context);
      if (converted === null) {
        fullyConverted = false;
        break;
      }
      convertedTotal += converted;
    }
    if (fullyConverted) {
      return {
        text: formatMoney(convertedTotal, context.display, locale, { converted: true }),
        approximate: true,
      };
    }
  }

  const totalsByCurrency = new Map<string, number>();
  for (const booking of bookings) {
    totalsByCurrency.set(
      booking.currency,
      (totalsByCurrency.get(booking.currency) ?? 0) + booking.amount,
    );
  }
  return {
    text: [...totalsByCurrency.entries()]
      .map(([currency, amount]) => formatMoney(amount, currency, locale))
      .join(" + "),
    approximate: false,
  };
}

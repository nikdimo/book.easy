import { currencyDecimals } from "@/lib/currency/currencies";

/**
 * Conversion and formatting for *display*. Isomorphic on purpose — the server
 * renders the first paint with it and the client re-renders with it when the
 * picker changes, and the two must agree to the character or React will report a
 * hydration mismatch on every price on the page.
 */

export interface ConversionContext {
  /** The currency the guest is browsing in. */
  display: string;
  /** Base-quoted multipliers, from `getExchangeRates()`. */
  rates: Readonly<Record<string, number>>;
}

/**
 * Converts an amount from a listing's official currency into the display currency.
 *
 * Returns null — never a fallback number — when either leg is unquotable. That null
 * is what makes the caller fall back to showing the official price, which is the
 * story's explicit requirement: no broken, zero or invented prices.
 *
 * Both legs go through the base currency, so a listing priced in a non-EUR currency
 * converts correctly without needing a rate table per official currency.
 */
export function convertAmount(
  amount: number,
  from: string,
  { display, rates }: ConversionContext,
): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === display) return amount;

  const fromRate = rates[from];
  const toRate = rates[display];
  if (!fromRate || !toRate || fromRate <= 0 || toRate <= 0) return null;

  return (amount / fromRate) * toRate;
}

/**
 * The single multiplier that takes an amount in `from` to the display currency, or
 * null when either leg is unquotable.
 *
 * Stored on a booking so the confirmation and its emails keep showing the figure
 * the guest actually saw, instead of silently re-converting at today's rate every
 * time the page is opened.
 */
export function conversionRate(
  from: string,
  { display, rates }: ConversionContext,
): number | null {
  if (from === display) return null;
  const fromRate = rates[from];
  const toRate = rates[display];
  if (!fromRate || !toRate || fromRate <= 0 || toRate <= 0) return null;
  return toRate / fromRate;
}

/**
 * How many decimals a *converted* amount should show.
 *
 * A converted price is an approximation, so rendering it to the cent implies a
 * precision it does not have — and a grid of "2,768.43 ден" is markedly harder to
 * scan than "2,768 ден". Above ten units the cents carry no information a guest is
 * comparing on, so they go. Below it they still matter proportionally (a €2 fee
 * must not round to $2 from $2.20), so the currency's normal precision is kept.
 *
 * Currencies that have no minor unit at all — JPY, HUF, ISK — are already at zero
 * from `currencyDecimals`, so they need no special case here or anywhere else.
 */
function convertedDecimals(amount: number, currency: string): number {
  const natural = currencyDecimals(currency);
  if (natural === 0) return 0;
  return Math.abs(amount) >= 10 ? 0 : natural;
}

export interface FormatMoneyOptions {
  /** True when `amount` is the result of a conversion rather than the authored
   *  price. Loosens the decimals as described above; official amounts always keep
   *  their exact precision because they are what someone actually owes. */
  converted?: boolean;
  /** Force the currency code instead of the symbol — used where a symbol alone
   *  would be ambiguous, such as the several currencies that render as "$". */
  showCode?: boolean;
}

/**
 * Formats money using the reading locale's own conventions, which is what makes
 * "€1,250" render as "1.250 €" in German and "1 250 €" in French without any of
 * that being spelled out here. Symbol position, grouping separator, decimal
 * separator and minor-unit count all come from `Intl`.
 */
export function formatMoney(
  amount: number,
  currency: string,
  locale = "en",
  { converted = false, showCode = false }: FormatMoneyOptions = {},
): string {
  const decimals = converted
    ? convertedDecimals(amount, currency)
    : currencyDecimals(currency);

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: showCode ? "code" : "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  } catch {
    // An unknown code or an unusable locale must not blank out a price. Rounding
    // stays consistent with the successful path.
    return `${amount.toFixed(decimals)} ${currency}`;
  }
}

export interface DisplayPrice {
  /** Ready to render. Already the official price when conversion was unavailable. */
  text: string;
  /** The currency `text` is expressed in — the display currency when conversion
   *  succeeded, the official one when it did not. */
  currency: string;
  /** False when conversion was unavailable or unnecessary, which is what the
   *  booking pages key their "official amount" disclosure off. */
  converted: boolean;
}

/**
 * The single decision point for rendering one price: convert if possible, format
 * for the reading locale, and fall back to the official currency rather than fail.
 * Everything guest-facing goes through here so the fallback behaves identically on
 * a property card, a map marker and a booking total.
 */
export function displayPrice(
  amount: number,
  officialCurrency: string,
  locale: string,
  context: ConversionContext | null,
): DisplayPrice {
  if (!context || context.display === officialCurrency) {
    return {
      text: formatMoney(amount, officialCurrency, locale),
      currency: officialCurrency,
      converted: false,
    };
  }

  const value = convertAmount(amount, officialCurrency, context);
  if (value === null) {
    return {
      text: formatMoney(amount, officialCurrency, locale),
      currency: officialCurrency,
      converted: false,
    };
  }

  return {
    text: formatMoney(value, context.display, locale, { converted: true }),
    currency: context.display,
    converted: true,
  };
}

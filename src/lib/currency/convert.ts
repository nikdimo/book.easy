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

/**
 * How many decimals to actually print.
 *
 * A price that lands on a whole unit says nothing with its minor digits: "€180.00"
 * is "€180" plus two characters of noise, and a calendar showing "€180" beside a
 * widget showing "€180.00" reads as two different prices. So the fraction goes
 * whenever it would print as zeros, and stays the moment it carries a value —
 * "€180.50" is still "€180.50".
 *
 * `exact` opts back into the currency's full precision for the price-details
 * tables, where an amount is being itemised rather than advertised and the rows
 * are meant to line up on the decimal separator.
 */
function displayDecimals(
  amount: number,
  currency: string,
  converted: boolean,
  exact: boolean,
): number {
  const decimals = converted
    ? convertedDecimals(amount, currency)
    : currencyDecimals(currency);
  if (exact || decimals === 0) return decimals;
  // Tested against what will actually be printed rather than the raw float, so a
  // converted 179.999 — which `Intl` will render as "180.00" — drops to "180"
  // instead of keeping cents it no longer has.
  return Number.isInteger(Number(amount.toFixed(decimals))) ? 0 : decimals;
}

export interface FormatMoneyOptions {
  /** True when `amount` is the result of a conversion rather than the authored
   *  price. Loosens the decimals as described above; an official amount keeps the
   *  currency's own precision, less a fraction that would only print zeros. */
  converted?: boolean;
  /** Force the currency code instead of the symbol — used where a symbol alone
   *  would be ambiguous, such as the several currencies that render as "$". */
  showCode?: boolean;
  /** Keep the currency's minor units even on a whole amount. For price-details
   *  tables and anything itemising what is owed, where "€1,260.00" is the form a
   *  reader expects to check a total in. Does not resurrect the cents `converted`
   *  dropped — an approximation stated to the cent is worse than a round one, and
   *  the exact figure is what `OfficialAmountNotice` is for. */
  exact?: boolean;
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
  {
    converted = false,
    showCode = false,
    exact = false,
  }: FormatMoneyOptions = {},
): string {
  const decimals = displayDecimals(amount, currency, converted, exact);

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
  { exact = false }: Pick<FormatMoneyOptions, "exact"> = {},
): DisplayPrice {
  if (!context || context.display === officialCurrency) {
    return {
      text: formatMoney(amount, officialCurrency, locale, { exact }),
      currency: officialCurrency,
      converted: false,
    };
  }

  const value = convertAmount(amount, officialCurrency, context);
  if (value === null) {
    return {
      text: formatMoney(amount, officialCurrency, locale, { exact }),
      currency: officialCurrency,
      converted: false,
    };
  }

  return {
    text: formatMoney(value, context.display, locale, {
      converted: true,
      exact,
    }),
    currency: context.display,
    converted: true,
  };
}

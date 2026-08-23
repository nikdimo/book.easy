import { convertAmount } from "@/lib/currency/convert";

/**
 * Locale formatting that cannot disagree between the server and the browser.
 *
 * `Intl` is only as good as the locale data the runtime shipped with. Node here has
 * full ICU and formats `mk` as Macedonian; the browser this was verified in has no
 * `mk` data at all and silently resolves it to its own default, so the very same call
 * produced "120,00 €" during SSR and "€120.00" after hydration — a hydration failure on
 * every price and every date in the calendar.
 *
 * So the server, which is the authority, resolves the locale *once* and ships the
 * resulting pattern — symbol, separators, month and weekday names, field order — as
 * plain data. The client renders from that snapshot with no `Intl` call at all, so both
 * renders produce the same characters whatever data the browser happens to have.
 *
 * Plural *category* selection deliberately still uses `Intl.PluralRules`: those rules
 * are part of the language, not the locale data bundle, and both runtimes agree on them
 * (verified for `mk`, which is the locale that exposed this bug).
 */

export interface MoneyFormat {
  symbol: string;
  /** Whether the symbol precedes the digits, e.g. `€120.00` vs `120,00 €`. */
  symbolFirst: boolean;
  /** Any literal ICU puts between the symbol and the digits — often a nbsp. */
  symbolSpacing: string;
  decimalSeparator: string;
  groupSeparator: string;
  fractionDigits: number;
  minusSign: string;
  /** Rightmost digit-group length, then the length that repeats to its left. */
  primaryGroupSize: number;
  secondaryGroupSize: number;
}

export type DateToken =
  | { type: "day" }
  | { type: "month" }
  | { type: "monthShort" }
  | { type: "year" }
  | { type: "literal"; value: string };

export interface DateFormat {
  /** Index 0 is January. */
  monthLong: string[];
  monthShort: string[];
  /** Index 0 is Monday, matching the grid's week start. */
  weekdayShort: string[];
  longDate: DateToken[];
  shortDate: DateToken[];
  monthYear: DateToken[];
}

/** The host's display currency and the rate table that reaches it, carried on the
 *  snapshot so a client component can convert without an `Intl` call or a fetch. */
export interface DisplayMoneyContext {
  currency: string;
  /** Base-quoted multipliers, exactly as `getExchangeRates()` returns them. */
  rates: Readonly<Record<string, number>>;
}

export interface CalendarFormats {
  /** What the server's `Intl` actually resolved to — reported, never re-resolved. */
  locale: string;
  money: Record<string, MoneyFormat>;
  date: DateFormat;
  /** Null when rates are unavailable, or absent on a snapshot built before this
   *  existed. Either way every amount renders in its listing's own currency. */
  display?: DisplayMoneyContext | null;
}

const PROBE_AMOUNT = 1234567.89;
const PROBE_YEAR = 2026;
/** A date with an unambiguous day, month and year, so tokens cannot be confused. */
const PROBE_DATE = new Date(2026, 10, 23);

function moneyFormat(locale: string, currency: string): MoneyFormat {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  });
  const parts = formatter.formatToParts(PROBE_AMOUNT);
  const currencyIndex = parts.findIndex((part) => part.type === "currency");
  const firstDigit = parts.findIndex((part) => part.type === "integer");
  const groups = parts
    .filter((part) => part.type === "integer")
    .map((part) => part.value.length);

  const symbolFirst = currencyIndex >= 0 && currencyIndex < firstDigit;
  const spacingPart = symbolFirst
    ? parts[currencyIndex + 1]
    : parts[currencyIndex - 1];

  return {
    symbol: parts[currencyIndex]?.value ?? currency,
    symbolFirst,
    symbolSpacing: spacingPart?.type === "literal" ? spacingPart.value : "",
    decimalSeparator:
      parts.find((part) => part.type === "decimal")?.value ?? ".",
    groupSeparator: parts.find((part) => part.type === "group")?.value ?? ",",
    fractionDigits: formatter.resolvedOptions().maximumFractionDigits ?? 2,
    minusSign:
      new Intl.NumberFormat(locale)
        .formatToParts(-1)
        .find((part) => part.type === "minusSign")?.value ?? "-",
    primaryGroupSize: groups[groups.length - 1] ?? 3,
    secondaryGroupSize: groups.length > 1 ? groups[groups.length - 2] : 3,
  };
}

function tokenize(
  locale: string,
  options: Intl.DateTimeFormatOptions,
  monthLong: string[],
  monthShort: string[],
): DateToken[] {
  return new Intl.DateTimeFormat(locale, options)
    .formatToParts(PROBE_DATE)
    .map((part): DateToken => {
      if (part.type === "day") return { type: "day" };
      if (part.type === "year") return { type: "year" };
      if (part.type === "month") {
        // A numeric month is rendered from the number; a named one has to come from
        // the name table so the client never needs the locale's month data.
        if (part.value === monthLong[PROBE_DATE.getMonth()]) {
          return { type: "month" };
        }
        if (part.value === monthShort[PROBE_DATE.getMonth()]) {
          return { type: "monthShort" };
        }
        return { type: "month" };
      }
      return { type: "literal", value: part.value };
    });
}

/**
 * Build the snapshot. Runs on the server only — it is the one place `Intl` decides
 * anything about this calendar.
 */
export function buildCalendarFormats(
  locale: string,
  currencies: string[],
  /** The host's display currency, so read-only amounts can be shown in the currency
   *  they chose. Editors ignore it: a field a host types a price into must stay in
   *  the currency that price is stored and paid in. */
  display?: DisplayMoneyContext | null,
): CalendarFormats {
  const resolved = new Intl.DateTimeFormat(locale).resolvedOptions().locale;
  const monthLong = Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(locale, { month: "long" }).format(
      new Date(PROBE_YEAR, month, 1),
    ),
  );
  const monthShort = Array.from({ length: 12 }, (_, month) =>
    new Intl.DateTimeFormat(locale, { month: "short" }).format(
      new Date(PROBE_YEAR, month, 1),
    ),
  );
  // 2026-11-23 is a Monday, so this walks Monday through Sunday.
  const weekdayShort = Array.from({ length: 7 }, (_, offset) =>
    new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
      new Date(2026, 10, 23 + offset),
    ),
  );

  const money: Record<string, MoneyFormat> = {};
  // The display currency joins the map even when no listing is priced in it — it is
  // the currency conversions land in, and a missing pattern would fall back to the
  // bare-code rendering for every converted amount on the screen.
  for (const currency of new Set(
    display ? [...currencies, display.currency] : currencies,
  )) {
    money[currency] = moneyFormat(locale, currency);
  }

  return {
    locale: resolved,
    money,
    display: display ?? null,
    date: {
      monthLong,
      monthShort,
      weekdayShort,
      longDate: tokenize(
        locale,
        { day: "numeric", month: "long", year: "numeric" },
        monthLong,
        monthShort,
      ),
      shortDate: tokenize(
        locale,
        { day: "numeric", month: "short" },
        monthLong,
        monthShort,
      ),
      monthYear: tokenize(
        locale,
        { month: "long", year: "numeric" },
        monthLong,
        monthShort,
      ),
    },
  };
}

function groupDigits(digits: string, format: MoneyFormat): string {
  const out: string[] = [];
  let cursor = digits.length;
  let size = format.primaryGroupSize;
  while (cursor > size) {
    out.unshift(digits.slice(cursor - size, cursor));
    cursor -= size;
    size = format.secondaryGroupSize;
  }
  out.unshift(digits.slice(0, cursor));
  return out.join(format.groupSeparator);
}

/** The snapshot's own `formatMoney`. No `Intl`, so no runtime data to disagree over. */
export function formatMoney(
  amount: number,
  currency: string,
  formats: CalendarFormats,
  options?: {
    /** Overrides the currency's own precision. Only `formatMoneyRounded` passes it. */
    fractionDigits?: number;
  },
): string {
  const format = formats.money[currency];
  if (!format) {
    // An unknown currency must not blank out a price, and must not be guessed at
    // with another currency's symbol either.
    return `${amount.toFixed(2)} ${currency}`;
  }
  const fractionDigits = options?.fractionDigits ?? format.fractionDigits;
  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(fractionDigits);
  const [integerPart, fractionPart = ""] = fixed.split(".");
  const digits = groupDigits(integerPart, format);
  const number =
    fractionDigits > 0
      ? `${digits}${format.decimalSeparator}${fractionPart}`
      : digits;
  const body = format.symbolFirst
    ? `${format.symbol}${format.symbolSpacing}${number}`
    : `${number}${format.symbolSpacing}${format.symbol}`;
  return negative ? `${format.minusSign}${body}` : body;
}

/**
 * The same amount, as a whole unit.
 *
 * Every price a host sets in this workspace is whole — the slider rounds, promotions
 * round by default, and nobody lets a room at €141.45. Padding all of them to `.00`
 * spends two characters per line to say "no decimals here", on a panel where a dozen
 * amounts can be on screen at once. Decimals are left to `formatMoney`, which the
 * price breakdown uses: a summary rounds for scanning, and the receipt beneath it
 * stays exact to the cent.
 */
export function formatMoneyRounded(
  amount: number,
  currency: string,
  formats: CalendarFormats,
): string {
  return formatMoney(Math.round(amount), currency, formats, {
    fractionDigits: 0,
  });
}

function renderTokens(
  tokens: DateToken[],
  { day, month, year }: { day: number; month: number; year: number },
  date: DateFormat,
): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case "day":
          return String(day);
        case "month":
          return date.monthLong[month] ?? String(month + 1);
        case "monthShort":
          return date.monthShort[month] ?? String(month + 1);
        case "year":
          return String(year);
        default:
          return token.value;
      }
    })
    .join("");
}

function parts(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return { year, month: month - 1, day };
}

export function formatLongDate(ymd: string, formats: CalendarFormats): string {
  return renderTokens(formats.date.longDate, parts(ymd), formats.date);
}

export function formatShortDate(ymd: string, formats: CalendarFormats): string {
  return renderTokens(formats.date.shortDate, parts(ymd), formats.date);
}

/** `ym` is any date inside the month; only its month and year are read. */
export function formatMonthYear(ymd: string, formats: CalendarFormats): string {
  return renderTokens(formats.date.monthYear, parts(ymd), formats.date);
}

export function weekdayLabels(formats: CalendarFormats): string[] {
  return formats.date.weekdayShort;
}

/**
 * One read-only amount, in the currency the host chose to read prices in.
 *
 * Conversion is display-only, and the official amount is always returned alongside so
 * the caller can disclose it: what a host is actually paid is the number in
 * `official`, and no screen may quietly replace it with an approximation. Falls back
 * to the official amount whenever the snapshot carries no display context or the pair
 * is unquotable — never to a guess, and never to a blank.
 *
 * Editors deliberately do not use this. A price a host types is the price that gets
 * stored and charged, so those fields stay in the listing's own currency; see the
 * note on `buildCalendarFormats`.
 */
export function formatDisplayMoney(
  amount: number,
  officialCurrency: string,
  formats: CalendarFormats,
): { text: string; official: string; currency: string; converted: boolean } {
  const official = formatMoney(amount, officialCurrency, formats);
  const display = formats.display;
  if (!display || display.currency === officialCurrency) {
    return { text: official, official, currency: officialCurrency, converted: false };
  }

  const converted = convertAmount(amount, officialCurrency, {
    display: display.currency,
    rates: display.rates,
  });
  if (converted === null) {
    return { text: official, official, currency: officialCurrency, converted: false };
  }

  return {
    // Whole units, matching what `displayPrice` does for converted amounts above ten:
    // a converted figure is an approximation, and rendering it to the cent claims a
    // precision it does not have.
    text: formatMoneyRounded(converted, display.currency, formats),
    official,
    currency: display.currency,
    converted: true,
  };
}

/**
 * The numeric half of `formatDisplayMoney`: an amount moved into the display currency,
 * or left in its own when that is not possible. Callers that have to *add* amounts
 * before showing them need this — summing two currencies and labelling the result with
 * whichever one came first is not a rounding error, it is a wrong number.
 */
export function toDisplayAmount(
  amount: number,
  officialCurrency: string,
  formats: CalendarFormats,
): { amount: number; currency: string; converted: boolean } {
  const display = formats.display;
  if (!display || display.currency === officialCurrency) {
    return { amount, currency: officialCurrency, converted: false };
  }
  const converted = convertAmount(amount, officialCurrency, {
    display: display.currency,
    rates: display.rates,
  });
  return converted === null
    ? { amount, currency: officialCurrency, converted: false }
    : { amount: converted, currency: display.currency, converted: true };
}

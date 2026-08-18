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

export interface CalendarFormats {
  /** What the server's `Intl` actually resolved to — reported, never re-resolved. */
  locale: string;
  money: Record<string, MoneyFormat>;
  date: DateFormat;
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
  for (const currency of new Set(currencies)) {
    money[currency] = moneyFormat(locale, currency);
  }

  return {
    locale: resolved,
    money,
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
): string {
  const format = formats.money[currency];
  if (!format) {
    // An unknown currency must not blank out a price, and must not be guessed at
    // with another currency's symbol either.
    return `${amount.toFixed(2)} ${currency}`;
  }
  const negative = amount < 0;
  const fixed = Math.abs(amount).toFixed(format.fractionDigits);
  const [integerPart, fractionPart = ""] = fixed.split(".");
  const digits = groupDigits(integerPart, format);
  const number =
    format.fractionDigits > 0
      ? `${digits}${format.decimalSeparator}${fractionPart}`
      : digits;
  const body = format.symbolFirst
    ? `${format.symbol}${format.symbolSpacing}${number}`
    : `${number}${format.symbolSpacing}${format.symbol}`;
  return negative ? `${format.minusSign}${body}` : body;
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

/**
 * The display-currency catalog.
 *
 * Deliberately only two flat records rather than a table of symbols and decimal
 * rules: `Intl` already knows every ISO 4217 currency's symbol, its symbol
 * position, and how many decimal places it uses (JPY none, KWD three, EUR two).
 * Hand-maintaining that would be a second, worse copy that drifts. What `Intl`
 * cannot tell us is which currencies this platform supports and which country
 * normally uses which one — that is what lives here.
 */

/** Supported display currencies, keyed by ISO 4217 code. Every code here must be
 *  quotable by the exchange-rate provider; `lib/currency/rates.ts` drops any that
 *  the provider stops returning rather than showing an invented price. */
export const CURRENCY_NAMES: Readonly<Record<string, string>> = {
  AED: "United Arab Emirates dirham",
  ALL: "Albanian lek",
  AMD: "Armenian dram",
  ARS: "Argentine peso",
  AUD: "Australian dollar",
  AZN: "Azerbaijani manat",
  BAM: "Bosnia-Herzegovina convertible mark",
  BDT: "Bangladeshi taka",
  BGN: "Bulgarian lev",
  BHD: "Bahraini dinar",
  BRL: "Brazilian real",
  BYN: "Belarusian ruble",
  CAD: "Canadian dollar",
  CHF: "Swiss franc",
  CLP: "Chilean peso",
  CNY: "Chinese yuan",
  COP: "Colombian peso",
  CRC: "Costa Rican colón",
  CZK: "Czech koruna",
  DKK: "Danish krone",
  DOP: "Dominican peso",
  DZD: "Algerian dinar",
  EGP: "Egyptian pound",
  ETB: "Ethiopian birr",
  EUR: "Euro",
  GBP: "British pound",
  GEL: "Georgian lari",
  GHS: "Ghanaian cedi",
  HKD: "Hong Kong dollar",
  HUF: "Hungarian forint",
  IDR: "Indonesian rupiah",
  ILS: "Israeli new shekel",
  INR: "Indian rupee",
  IQD: "Iraqi dinar",
  ISK: "Icelandic króna",
  JOD: "Jordanian dinar",
  JPY: "Japanese yen",
  KES: "Kenyan shilling",
  KRW: "South Korean won",
  KWD: "Kuwaiti dinar",
  KZT: "Kazakhstani tenge",
  LBP: "Lebanese pound",
  LKR: "Sri Lankan rupee",
  MAD: "Moroccan dirham",
  MDL: "Moldovan leu",
  MKD: "Macedonian denar",
  MXN: "Mexican peso",
  MYR: "Malaysian ringgit",
  NGN: "Nigerian naira",
  NOK: "Norwegian krone",
  NPR: "Nepalese rupee",
  NZD: "New Zealand dollar",
  OMR: "Omani rial",
  PEN: "Peruvian sol",
  PHP: "Philippine peso",
  PKR: "Pakistani rupee",
  PLN: "Polish złoty",
  QAR: "Qatari riyal",
  RON: "Romanian leu",
  RSD: "Serbian dinar",
  RUB: "Russian ruble",
  SAR: "Saudi riyal",
  SEK: "Swedish krona",
  SGD: "Singapore dollar",
  THB: "Thai baht",
  TND: "Tunisian dinar",
  TRY: "Turkish lira",
  TWD: "New Taiwan dollar",
  TZS: "Tanzanian shilling",
  UAH: "Ukrainian hryvnia",
  UGX: "Ugandan shilling",
  USD: "United States dollar",
  UYU: "Uruguayan peso",
  UZS: "Uzbekistani som",
  VND: "Vietnamese dong",
  XAF: "Central African CFA franc",
  XOF: "West African CFA franc",
  ZAR: "South African rand",
} as const;

export type SupportedCurrency = string;

/**
 * Country to the currency its residents normally price in, keyed by ISO 3166-1
 * alpha-2 — the same shape Cloudflare's `cf-ipcountry` header sends.
 *
 * This is a *maintained* mapping, not a derivation from the language list. The two
 * genuinely differ: Greece speaks Greek and prices in EUR, Austria and Germany
 * share a language and a currency, Switzerland shares German but not the currency.
 * Deriving one from the other would get all three wrong.
 *
 * Countries whose everyday pricing currency is unstable, dollarised, or otherwise
 * not what the official currency suggests are deliberately absent: falling back to
 * EUR is better than confidently showing the wrong local currency, and the visitor
 * can always pick their own.
 */
export const COUNTRY_CURRENCY: Readonly<Record<string, SupportedCurrency>> = {
  AE: "AED",
  AL: "ALL",
  AM: "AMD",
  AR: "ARS",
  AT: "EUR",
  AU: "AUD",
  AZ: "AZN",
  BA: "BAM",
  BD: "BDT",
  BE: "EUR",
  BG: "BGN",
  BH: "BHD",
  BR: "BRL",
  BY: "BYN",
  CA: "CAD",
  CH: "CHF",
  CL: "CLP",
  CN: "CNY",
  CO: "COP",
  CR: "CRC",
  CY: "EUR",
  CZ: "CZK",
  DE: "EUR",
  DK: "DKK",
  DO: "DOP",
  DZ: "DZD",
  EE: "EUR",
  EG: "EGP",
  ES: "EUR",
  ET: "ETB",
  FI: "EUR",
  FR: "EUR",
  GB: "GBP",
  GE: "GEL",
  GH: "GHS",
  GR: "EUR",
  HK: "HKD",
  HR: "EUR",
  HU: "HUF",
  ID: "IDR",
  IE: "EUR",
  IL: "ILS",
  IN: "INR",
  IQ: "IQD",
  IS: "ISK",
  IT: "EUR",
  JO: "JOD",
  JP: "JPY",
  KE: "KES",
  KR: "KRW",
  KW: "KWD",
  KZ: "KZT",
  LB: "LBP",
  LK: "LKR",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MA: "MAD",
  MC: "EUR",
  MD: "MDL",
  ME: "EUR",
  MK: "MKD",
  MT: "EUR",
  MX: "MXN",
  MY: "MYR",
  NG: "NGN",
  NL: "EUR",
  NO: "NOK",
  NP: "NPR",
  NZ: "NZD",
  OM: "OMR",
  PE: "PEN",
  PH: "PHP",
  PK: "PKR",
  PL: "PLN",
  PT: "EUR",
  QA: "QAR",
  RO: "RON",
  RS: "RSD",
  RU: "RUB",
  SA: "SAR",
  SE: "SEK",
  SG: "SGD",
  SI: "EUR",
  SK: "EUR",
  SM: "EUR",
  TH: "THB",
  TN: "TND",
  TR: "TRY",
  TW: "TWD",
  TZ: "TZS",
  UA: "UAH",
  UG: "UGX",
  US: "USD",
  UY: "UYU",
  UZ: "UZS",
  VA: "EUR",
  VN: "VND",
  XK: "EUR",
  ZA: "ZAR",
} as const;

export const SUPPORTED_CURRENCY_CODES = Object.keys(CURRENCY_NAMES);

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  // The live rate table is the source of truth for what can actually be selected.
  // Keeping this structural lets the provider add a valid ISO currency without a
  // deployment; names still come from Intl, with CURRENCY_NAMES as a fallback.
  return /^[A-Z]{3}$/.test(code);
}

/** The currency's name in `locale` when the runtime has one, falling back to the
 *  catalog's English name. `Intl.DisplayNames` covers most languages but not every
 *  currency in every one of them, and it returns the bare code when it has nothing
 *  — which would render "MKD — MKD" in the picker. */
export function currencyDisplayName(code: string, locale = "en"): string {
  const english = CURRENCY_NAMES[code] ?? code;
  try {
    const localized = new Intl.DisplayNames([locale], { type: "currency" }).of(code);
    return localized && localized !== code ? localized : english;
  } catch {
    return english;
  }
}

/** The symbol as it is actually rendered for this locale — "kr", "€", "ден", "¥".
 *  Extracted from a formatted zero rather than a lookup table so it always agrees
 *  with what `formatMoney` will print. Returns the code when the locale has no
 *  distinct symbol, which is correct: that is what `Intl` would show. */
export function currencySymbol(code: string, locale = "en"): string {
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    return parts.find((part) => part.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

/** How many decimal places this currency uses — 0 for JPY and HUF, 3 for KWD and
 *  BHD, 2 for most. Read from `Intl` rather than stored, so "currencies that
 *  normally do not use decimal amounts" need no special-casing anywhere. */
export function currencyDecimals(code: string): number {
  try {
    // `maximumFractionDigits` is optional in the type even though a currency-style
    // formatter always resolves one; two is the ISO 4217 default it would have.
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/** Every term a currency should be findable by: its code, its English name, its
 *  name in the reading language, its symbol, and the English names of the
 *  countries that use it — the spec asks for search by country, so a Dane typing
 *  "Denmark" must reach DKK even while reading the site in Macedonian. */
export function currencySearchText(code: string, locale = "en"): string {
  const countries = Object.entries(COUNTRY_CURRENCY)
    .filter(([, currency]) => currency === code)
    .flatMap(([country]) => {
      const names = [country];
      for (const naming of new Set([locale, "en"])) {
        try {
          const name = new Intl.DisplayNames([naming], { type: "region" }).of(country);
          if (name && name !== country) names.push(name);
        } catch {
          // A locale the runtime cannot name regions in simply contributes nothing.
        }
      }
      return names;
    });

  return [
    code,
    CURRENCY_NAMES[code] ?? "",
    currencyDisplayName(code, locale),
    currencySymbol(code, locale),
    ...countries,
  ].join(" ");
}

/** Shared with the language tab so both halves of the picker match identically. */
export { tokenContainmentScore as currencySearchScore } from "@/lib/utils/search-score";

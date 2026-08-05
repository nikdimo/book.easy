import { COUNTRY_CURRENCY, isSupportedCurrency } from "@/lib/currency/currencies";

/** The currency every price is authored, stored, charged and settled in. Display
 *  currency is a presentation layer on top of this and never replaces it. */
export const BASE_CURRENCY = "EUR";

/** Platform fallback when nothing else resolves — deliberately the same as the base
 *  currency, so the fallback path needs no conversion and cannot be wrong. */
export const DEFAULT_DISPLAY_CURRENCY = BASE_CURRENCY;

export const DISPLAY_CURRENCY_COOKIE = "bookeasy_currency";
/** Marks `DISPLAY_CURRENCY_COOKIE` as a choice made in the picker. Without this
 * marker the value is only an automatically detected browser default, which must
 * not outrank a signed-in account preference. */
export const DISPLAY_CURRENCY_EXPLICIT_COOKIE = "bookeasy_currency_explicit";

const CURRENCY_CODE_RE = /^[A-Za-z]{3}$/;

/**
 * Uppercases a well-formed ISO 4217 code and rejects everything else, including
 * anything carrying cookie punctuation. Mirrors `normalizeLocaleCode` — these
 * values arrive from a cookie the visitor can edit, and they are interpolated back
 * into a `Set-Cookie` header in the proxy.
 *
 * An unsupported-but-well-formed code is rejected too, not passed through: a stale
 * cookie naming a currency the provider no longer quotes must fall through to the
 * next source rather than reaching `Intl` and throwing.
 */
export function normalizeCurrencyCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !CURRENCY_CODE_RE.test(trimmed)) return null;

  const code = trimmed.toUpperCase();
  return isSupportedCurrency(code) ? code : null;
}

/** The currency a first-time visitor from this country most likely thinks in.
 *  Null for countries the maintained mapping deliberately omits — see the note in
 *  `currencies.ts` on why guessing is worse than falling back to EUR. */
export function currencyFromCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] ?? null;
}

export interface CurrencyPreferenceInput {
  /** The visitor's own choice, from the cookie the picker writes. */
  explicit?: string | null;
  /** The signed-in account's stored preference. */
  account?: string | null;
  /** A previously detected default saved in this browser. */
  browser?: string | null;
  /** ISO 3166-1 alpha-2, from `cf-ipcountry`. */
  country?: string | null;
}

export interface CurrencyPreference {
  currency: string;
  source: "explicit" | "account" | "browser" | "country" | "default";
}

/**
 * Resolution order, matching the story's stated priority:
 *
 *   1. a choice the visitor made in this browser  (`explicit`)
 *   2. a choice stored on their account           (`account`)
 *   3. an automatic default saved in the browser  (`browser`)
 *   4. the country their IP resolves to           (`country`)
 *   5. the platform fallback                      (EUR)
 *
 * The cookie outranks the account on purpose. Both are explicit choices, but the
 * cookie is the *more recent* one — it is written the moment the picker is used,
 * including during the visit in which someone signs in. Reading the account first
 * would overwrite a selection made seconds earlier, which the story calls out
 * specifically ("a preference they have just manually selected during the current
 * visit should not unexpectedly be overwritten"). Signing in on a fresh browser
 * has no cookie yet, so the account preference still lands there.
 *
 * IP is only ever consulted when there is no stored choice at all, which is what
 * keeps a VPN or a trip abroad from silently re-pricing the site for someone who
 * has already picked.
 */
export function resolveCurrencyPreference({
  explicit,
  account,
  browser,
  country,
}: CurrencyPreferenceInput): CurrencyPreference {
  const chosen = normalizeCurrencyCode(explicit);
  if (chosen) return { currency: chosen, source: "explicit" };

  const stored = normalizeCurrencyCode(account);
  if (stored) return { currency: stored, source: "account" };

  const savedDefault = normalizeCurrencyCode(browser);
  if (savedDefault) return { currency: savedDefault, source: "browser" };

  const detected = currencyFromCountry(country);
  if (detected) return { currency: detected, source: "country" };

  return { currency: DEFAULT_DISPLAY_CURRENCY, source: "default" };
}

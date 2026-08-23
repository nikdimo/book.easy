import { convertAmount } from "@/lib/currency/convert";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import {
  CLEANING_FEE_MAX,
  MAX_STORED_MONEY_INTEGER,
  NIGHTLY_PRICE_MAX,
  NIGHTLY_PRICE_MIN,
} from "@/lib/host/v2/listing-nightly-price";

/**
 * Converts a EUR-denominated typo guard into the currency the host is actually
 * pricing in. A bare 1,000 ceiling is useful for EUR but makes an ordinary cleaning
 * fee impossible in MKD. When rates are unavailable, the storage ceiling is the only
 * honest fallback; applying the EUR number to another denomination would be a guess.
 */
export function currencyAdjustedMaximum(
  referenceMaximum: number,
  currency: string,
  rates: Readonly<Record<string, number>> | null,
): number {
  if (currency === BASE_CURRENCY) return referenceMaximum;
  if (!rates) return MAX_STORED_MONEY_INTEGER;
  const converted = convertAmount(referenceMaximum, BASE_CURRENCY, {
    display: currency,
    rates,
  });
  if (converted === null) return MAX_STORED_MONEY_INTEGER;
  return Math.min(
    MAX_STORED_MONEY_INTEGER,
    Math.max(1, Math.round(converted)),
  );
}

/**
 * What may be offered when the currency a draft is priced in stops matching the one
 * the host is reading the site in.
 *
 * The one outcome that is never on this list is "relabel": taking 100 EUR and calling
 * it 100 USD. A listing's currency is what a guest will be charged in and what the
 * host will be paid in, so changing the label without changing the number silently
 * re-prices the property — by about 8% today, by whatever the rate is tomorrow. Every
 * branch here either moves the amount with the label or removes the amount entirely.
 *
 * - `none`   — nothing to offer; the draft is already in the host's currency.
 * - `convert`— rates can price the existing amounts in the new currency exactly.
 * - `clear`  — no usable rate, so the only honest change is to drop the amounts and
 *              have the host type them again. Offered, never performed on its own.
 */
export type DraftCurrencyOffer = "none" | "convert" | "clear";

export function draftCurrencyOffer(
  draftCurrency: string,
  displayCurrency: string,
  rates: Readonly<Record<string, number>> | null,
): DraftCurrencyOffer {
  if (!draftCurrency || !displayCurrency) return "none";
  if (draftCurrency === displayCurrency) return "none";
  return canConvertBetween(draftCurrency, displayCurrency, rates) ? "convert" : "clear";
}

function canConvertBetween(
  from: string,
  to: string,
  rates: Readonly<Record<string, number>> | null,
): boolean {
  if (!rates) return false;
  return convertAmount(1, from, { display: to, rates }) !== null;
}

/**
 * Re-prices one whole-unit amount from `from` into `to`.
 *
 * Whole units because that is the only precision this step ever stores — the field
 * accepts digits and nothing else. Rounding is applied *after* conversion rather than
 * to the rate, so 137 DKK does not drift by a cent per unit.
 *
 * Returns null when the amount cannot be converted, and an empty string stays empty:
 * "no cleaning fee" converts to "no cleaning fee", not to zero-something.
 */
export function convertDraftAmount(
  raw: string,
  from: string,
  to: string,
  rates: Readonly<Record<string, number>> | null,
  { max = NIGHTLY_PRICE_MAX, min = 0 }: { max?: number; min?: number } = {},
): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return "";
  if (!rates) return null;

  const value = Number.parseInt(digits, 10);
  if (!Number.isFinite(value)) return null;

  const converted = convertAmount(value, from, { display: to, rates });
  if (converted === null) return null;

  // Refuse instead of clamp. Clamping €100,000 converted to DKK at 100,000 DKK loses
  // most of the value while looking like a successful conversion — precisely the
  // silent re-pricing this module exists to prevent.
  const rounded = Math.round(converted);
  if (rounded < min || rounded > max) return null;
  return String(rounded);
}

/** Both amounts of the price step, re-priced together. Null when either leg cannot be
 *  converted — a half-converted price and a stale fee is worse than not offering. */
export function convertPriceStepAmounts(
  amounts: { price: string; cleaningFee: string },
  from: string,
  to: string,
  rates: Readonly<Record<string, number>> | null,
): { price: string; cleaningFee: string } | null {
  const nightlyMax = currencyAdjustedMaximum(NIGHTLY_PRICE_MAX, to, rates);
  const cleaningFeeMax = currencyAdjustedMaximum(CLEANING_FEE_MAX, to, rates);
  const price = convertDraftAmount(amounts.price, from, to, rates, {
    min: NIGHTLY_PRICE_MIN,
    max: nightlyMax,
  });
  if (price === null) return null;
  const cleaningFee = convertDraftAmount(amounts.cleaningFee, from, to, rates, {
    max: cleaningFeeMax,
  });
  if (cleaningFee === null) return null;
  return { price, cleaningFee };
}

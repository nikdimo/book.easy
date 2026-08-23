/**
 * The rules behind the nightly price a host types when creating a listing.
 *
 * Nothing new is invented here. The floor is the one the pricing service already
 * enforces (`pricingSchema`'s `baseNightlyRate: min(1)`, restated as a constant so the
 * create flow can show it before anything is sent), and whole currency units are the
 * same rounding the Calendar's price editor applies — "a host who picks a price is
 * choosing a price, not a formula", so cents never appear in this field either.
 *
 * The ceiling is the one rule with no server counterpart: it exists so a slipped key
 * cannot turn €90 into €900000 without the host noticing, and it is documented as a UI
 * guard rather than a pricing rule. It is deliberately far above any real nightly rate.
 *
 * Kept free of i18n and JSX, like `listing-basics` next to it, so the rules can be unit
 * tested directly and the caller turns an issue code into a sentence.
 */

/** The lowest the pricing service accepts, in whole currency units. */
export const NIGHTLY_PRICE_MIN = 1;

/** A UI-only sanity ceiling — no stored rule caps a nightly rate. */
export const NIGHTLY_PRICE_MAX = 100_000;

/** `PricingRule` stores `Decimal(14, 3)`, leaving eleven whole-number digits. The
 *  input must permit those digits because a sensible EUR guard converted to a
 *  low-value currency (MKD, JPY or VND) can legitimately need far more than six. */
export const MAX_STORED_MONEY_INTEGER = 99_999_999_999;
const MAX_MONEY_DIGITS = 11;

export type NightlyPriceIssue = "EMPTY" | "TOO_LOW" | "TOO_HIGH";

/**
 * What the field is allowed to contain while the host is typing.
 *
 * Digits only: whole currency units are the unit of pricing everywhere else in the
 * product, so a separator or a minus sign has nothing to mean here. A leading zero is
 * dropped rather than rejected — typing over a pre-filled amount otherwise leaves "060"
 * on screen — but a lone "0" survives so the host can clear the field down to nothing
 * and get the "too low" message rather than a silent empty box.
 */
export function sanitizeNightlyPriceInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, MAX_MONEY_DIGITS);
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  return trimmed;
}

/** The amount the field currently holds, or null when it holds no number at all. */
export function parseNightlyPrice(raw: string): number | null {
  const digits = sanitizeNightlyPriceInput(raw);
  if (digits.length === 0) return null;
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : null;
}

/** What is wrong with the amount, or undefined when it is one the flow can move on
 *  with. Raw input is sanitized here, so callers can pass the field value directly. */
export function nightlyPriceIssue(
  raw: string,
  max: number = NIGHTLY_PRICE_MAX,
): NightlyPriceIssue | undefined {
  const value = parseNightlyPrice(raw);
  if (value === null) return "EMPTY";
  if (value < NIGHTLY_PRICE_MIN) return "TOO_LOW";
  if (value > max) return "TOO_HIGH";
  return undefined;
}

/** Whether the step is done. Same answer as `nightlyPriceIssue` being empty, named for
 *  the question the footer actually asks. */
export function nightlyPriceComplete(raw: string, max: number = NIGHTLY_PRICE_MAX): boolean {
  return nightlyPriceIssue(raw, max) === undefined;
}

/* ─── The cleaning fee ────────────────────────────────────────────────────────────
 *
 * Optional, and charged once per stay rather than per night — which is the one thing
 * about it a host has to understand, and why it lives on the same screen as the nightly
 * price instead of on its own.
 *
 * The floor is the pricing schema's own `cleaningFee: min(0)`; zero means "no cleaning
 * fee", never "unanswered", so an empty field is a complete answer and never blocks the
 * step. The ceiling is a UI-only typo guard, exactly like `NIGHTLY_PRICE_MAX`: nothing
 * stored caps a cleaning fee, but a slipped key turning €15 into €1500 should be caught
 * while the host is still looking at it.
 */

/** No cleaning fee. A complete answer, not a missing one. */
export const CLEANING_FEE_MIN = 0;

/** A UI-only sanity ceiling — no stored rule caps a cleaning fee. */
export const CLEANING_FEE_MAX = 1_000;

export type CleaningFeeIssue = "TOO_HIGH";

/** Whole currency units only, on the same terms as the nightly price. */
export function sanitizeCleaningFeeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, MAX_MONEY_DIGITS);
  return digits.replace(/^0+(?=\d)/, "");
}

/** The fee the field holds. An empty field is zero — the host declining to charge one. */
export function parseCleaningFee(raw: string): number {
  const digits = sanitizeCleaningFeeInput(raw);
  if (digits.length === 0) return CLEANING_FEE_MIN;
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : CLEANING_FEE_MIN;
}

/** What is wrong with the fee, or undefined. Empty is never wrong. */
export function cleaningFeeIssue(
  raw: string,
  max: number = CLEANING_FEE_MAX,
): CleaningFeeIssue | undefined {
  return parseCleaningFee(raw) > max ? "TOO_HIGH" : undefined;
}

/* ─── Nudging the amount ──────────────────────────────────────────────────────────── */

/** What one tap of the stepper is worth. Five, not one: a host adjusting a nightly rate
 *  is moving it by a meaningful amount, and ±1 on a €60 price is forty taps to get
 *  anywhere. The field stays typable for anything in between. */
export const NIGHTLY_PRICE_STEP = 5;

/**
 * The amount after one tap, as field text.
 *
 * Clamped into the same bounds the field enforces, so the stepper can never put the
 * screen into an error state the host did not type themselves. An empty field steps up
 * from nothing rather than refusing to move.
 */
export function stepNightlyPrice(
  raw: string,
  direction: 1 | -1,
  max: number = NIGHTLY_PRICE_MAX,
): string {
  const current = parseNightlyPrice(raw) ?? 0;
  const next = current + direction * NIGHTLY_PRICE_STEP;
  return String(Math.min(max, Math.max(NIGHTLY_PRICE_MIN, next)));
}

/** Whether a tap in that direction would change anything — the stepper is disabled at
 *  the bounds rather than silently doing nothing. */
export function canStepNightlyPrice(
  raw: string,
  direction: 1 | -1,
  max: number = NIGHTLY_PRICE_MAX,
): boolean {
  return stepNightlyPrice(raw, direction, max) !== sanitizeNightlyPriceInput(raw);
}

/* ─── What a stay costs ───────────────────────────────────────────────────────────── */

/**
 * The stay the screen prices as an example.
 *
 * Three nights, fixed: the host's own minimum stay is not set until the availability
 * step, two screens later, so there is no real number to use — and this line exists to
 * demonstrate that the fee is charged once, not to predict a booking.
 */
export const EXAMPLE_STAY_NIGHTS = 3;

/** Nightly rate × nights, plus the cleaning fee once. Null when there is no price to
 *  work from, so the caller shows nothing rather than an example costing the fee alone. */
export function exampleStayTotal(
  nightlyRaw: string,
  cleaningFeeRaw: string,
  nights: number = EXAMPLE_STAY_NIGHTS,
): number | null {
  const nightly = parseNightlyPrice(nightlyRaw);
  if (nightly === null) return null;
  return nightly * nights + parseCleaningFee(cleaningFeeRaw);
}

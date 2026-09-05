import { addDaysToYmd } from "@/lib/utils/date-only";
import { contiguousRuns, contiguousRunsBy } from "./calendar-date-runs";
import type { ListingCalendarIndex } from "./calendar-model";
import type { MutationStep } from "./calendar-review";
import type { HostCalendarListing } from "./calendar-types";

/**
 * Nightly price as a direct act, and as a percentage of the base price.
 *
 * The percentage is a way of typing a number, not a rule that keeps running. `−15%`
 * resolves to an amount the moment it is applied and that amount is what is stored, so
 * raising the base price afterwards leaves these dates exactly where the host put them.
 * Anything that should genuinely track the base price is a promotion, which this
 * workspace already has and which this is deliberately not.
 *
 * Both directions round to whole currency units. A host who picks "−15%" is choosing a
 * price, not a formula, and `€158.95` is not a price anyone chooses.
 */

/** The percentage the quick chips offer, in the order they are shown. */
export const PRICE_PERCENT_PRESETS = [-30, -15, 0, 15, 30] as const;

/** How far the slider reaches either side of the base price. */
export const PRICE_PERCENT_RANGE = 30;

export interface PriceActionModel {
  dates: string[];
  base: number;
  currency: string;
  /** Cheapest and dearest night in the selection as it stands. */
  min: number;
  max: number;
  /** The selected nights do not all cost the same. */
  mixed: boolean;
  /** How many carry a price of their own rather than the base price. */
  customCount: number;
}

export function buildPriceAction({
  listing,
  index,
  dates,
}: {
  listing: HostCalendarListing;
  index: ListingCalendarIndex;
  dates: string[];
}): PriceActionModel | null {
  const pricing = listing.pricing;
  if (!pricing) return null;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let customCount = 0;
  for (const date of dates) {
    const override = index.priceByDate.get(date);
    if (override !== undefined) customCount += 1;
    const rate = override ?? pricing.baseNightlyRate;
    if (rate < min) min = rate;
    if (rate > max) max = rate;
  }

  return {
    dates,
    base: pricing.baseNightlyRate,
    currency: pricing.currency,
    min: Number.isFinite(min) ? min : pricing.baseNightlyRate,
    max: Number.isFinite(max) ? max : pricing.baseNightlyRate,
    mixed: min !== max,
    customCount,
  };
}

/**
 * A percentage of the base price, as a price.
 *
 * Floored at one currency unit, because that is the lowest the pricing service accepts
 * and −30% of a very low base would otherwise resolve to a price that cannot be saved.
 */
/**
 * The whole units a host typed, out of whatever they actually typed.
 *
 * Stripping every non-digit is the obvious reading and the wrong one: "141.45" becomes
 * 14145, a price a hundred times too high, silently, with the field showing what looks
 * like a normal number. A European keyboard produces "141,45" and fails the same way.
 *
 * Every amount in this workspace is whole, so a typed fraction is dropped rather than
 * rejected — the host lands on the unit they meant. A separator with one or two digits
 * behind it is that fraction; anything else is a thousands separator and survives, so
 * "1,200" and "1.200" both stay 1200.
 *
 * Returns null when there is no number in the input at all, which is how a half-typed
 * field ("", "€") is told apart from a real zero.
 */
export function wholeAmountFromInput(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,]/g, "").replace(/[.,](\d{1,2})$/, "");
  const digits = cleaned.replace(/[.,]/g, "");
  if (digits.length === 0) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

export function priceFromPercent(base: number, percent: number): number {
  return Math.max(1, Math.round(base * (1 + percent / 100)));
}

/**
 * The same arithmetic for a fee rather than a nightly rate.
 *
 * It floors at zero, not at one. A night that costs nothing is a night nobody is
 * charged for and `priceFromPercent` is right to refuse it; a cleaning fee of nothing is
 * an ordinary listing that does not charge for cleaning, and −100% has to be able to
 * reach it.
 */
export function feeFromPercent(base: number, percent: number): number {
  return Math.max(0, Math.round(base * (1 + percent / 100)));
}

/** A price, as a percentage of the base price. Rounded, like everything else here. */
export function percentFromPrice(base: number, price: number): number {
  if (base <= 0) return 0;
  return Math.round(((price - base) / base) * 100);
}

/** Set one nightly rate on exactly these dates. */
export function stepsForPrice(
  dates: string[],
  nightlyRate: number,
): MutationStep[] {
  return contiguousRuns(dates).map((run) => ({
    type: "SET_DATE_PRICE",
    startDate: run.start,
    endDate: addDaysToYmd(run.end, 1),
    nightlyRate,
  }));
}

/** Drop the per-date price on exactly these dates, back to the base price. */
export function stepsForBasePrice(dates: string[]): MutationStep[] {
  return contiguousRuns(dates).map((run) => ({
    type: "CLEAR_DATE_PRICE",
    startDate: run.start,
    endDate: addDaysToYmd(run.end, 1),
  }));
}

/**
 * Put these dates back exactly as they were priced.
 *
 * Not one range at one price: a selection can span nights that each had their own
 * amount and nights that had none at all, so the dates are grouped by what they cost
 * before the edit. Runs that had no price of their own are cleared rather than set to
 * the base amount — storing the base price as an override would look identical today
 * and stop following the base price tomorrow.
 */
export function undoStepsForPrices(
  index: ListingCalendarIndex,
  dates: string[],
): MutationStep[] {
  return contiguousRunsBy(dates, (date) => index.priceByDate.get(date)).map(
    (run) =>
      run.key === undefined
        ? {
            type: "CLEAR_DATE_PRICE",
            startDate: run.start,
            endDate: addDaysToYmd(run.end, 1),
          }
        : {
            type: "SET_DATE_PRICE",
            startDate: run.start,
            endDate: addDaysToYmd(run.end, 1),
            nightlyRate: run.key,
          },
  );
}

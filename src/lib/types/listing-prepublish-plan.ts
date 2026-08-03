/**
 * The optional date-specific setup a host can do on the last screen of the create
 * wizard, before the listing exists.
 *
 * A draft is a JSON blob (`ListingDraft.data`) — there is no `Listing` row yet, and
 * `AvailabilityBlock`, `ListingDatePrice` and `ListingPromotion` all hang off a
 * `listingId`. So these choices are carried as plain data through the draft and the
 * publish form, and turned into rows inside the same `listing.create` that makes the
 * listing. Nothing is written for a wizard the host abandons.
 *
 * Shared by the client (which builds the plan) and the publish action (which trusts
 * none of it and re-validates) — keep it free of React and Prisma imports.
 */

/** A calendar day as `YYYY-MM-DD`. Deliberately a plain string: these are civil dates
 *  with no timezone, and a `Date` here would drift a day either way depending on where
 *  the host's browser is. */
export type PlanDate = string;

export interface PrePublishRange {
  startDate: PlanDate;
  endDate: PlanDate;
}

export type PrePublishBlock = PrePublishRange;

export interface PrePublishDatePrice extends PrePublishRange {
  nightlyRate: number;
}

export interface PrePublishOffer extends PrePublishRange {
  type: "PERCENT_DISCOUNT" | "FREE_CLEANING";
  /** 0 for a free-cleaning offer, 5–50 for a percentage one. */
  discountPercent: number;
}

export interface PrePublishPlan {
  blocks: PrePublishBlock[];
  datePrices: PrePublishDatePrice[];
  offers: PrePublishOffer[];
}

export const EMPTY_PRE_PUBLISH_PLAN: PrePublishPlan = {
  blocks: [],
  datePrices: [],
  offers: [],
};

/** Ceilings that exist to keep a malformed or hostile draft from turning into an
 *  unbounded write at publish time. A host setting up their first listing is nowhere
 *  near any of these. */
export const MAX_PLAN_ENTRIES = 60;
export const MAX_RANGE_NIGHTS = 730;
export const MAX_PLAN_DATE_PRICE_DAYS = 1_460;
export const MAX_NIGHTLY_RATE = 100_000;
export const MIN_OFFER_PERCENT = 5;
export const MAX_OFFER_PERCENT = 50;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

/** `YYYY-MM-DD` → a UTC-midnight Date, or null. Parsing the parts by hand rather than
 *  `new Date(string)` keeps it a civil date: no local-timezone shift, and no accepting
 *  the dozen other formats `Date` quietly takes. */
export function parsePlanDate(value: unknown): Date | null {
  if (typeof value !== "string" || !DATE_RE.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    // Rejects 2026-02-30 and friends, which Date would roll forward into March.
    return null;
  }
  return date;
}

export function formatPlanDate(date: Date): PlanDate {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** A local `Date` from a calendar picker → the civil date the host actually clicked.
 *  Uses the local field values, not the UTC ones, or a host east of UTC picking the
 *  1st stores the 31st. */
export function planDateFromLocal(date: Date): PlanDate {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Every day in an inclusive range, as plan dates. */
export function eachPlanDate(startDate: PlanDate, endDate: PlanDate): PlanDate[] {
  const start = parsePlanDate(startDate);
  const end = parsePlanDate(endDate);
  if (!start || !end || end < start) return [];
  const dates: PlanDate[] = [];
  for (let time = start.getTime(); time <= end.getTime(); time += MS_PER_DAY) {
    dates.push(formatPlanDate(new Date(time)));
  }
  return dates;
}

export function rangeNights(startDate: PlanDate, endDate: PlanDate): number {
  const start = parsePlanDate(startDate);
  const end = parsePlanDate(endDate);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
}

function validRange(value: unknown): PrePublishRange | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const start = parsePlanDate(raw.startDate);
  const end = parsePlanDate(raw.endDate);
  if (!start || !end || end < start) return null;
  const nights = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  if (nights > MAX_RANGE_NIGHTS) return null;
  return {
    startDate: formatPlanDate(start),
    endDate: formatPlanDate(end),
  };
}

function finiteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Turns anything — a stored draft, a posted form field — into a plan, dropping
 * entries that don't validate rather than failing the whole publish. A host should
 * never lose a finished listing because one optional date range was malformed.
 */
export function parsePrePublishPlan(raw: unknown): PrePublishPlan {
  let source: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return EMPTY_PRE_PUBLISH_PLAN;
    try {
      source = JSON.parse(raw);
    } catch {
      return EMPTY_PRE_PUBLISH_PLAN;
    }
  }
  if (!source || typeof source !== "object") return EMPTY_PRE_PUBLISH_PLAN;
  const input = source as Record<string, unknown>;

  const blocks: PrePublishBlock[] = [];
  for (const entry of Array.isArray(input.blocks) ? input.blocks : []) {
    const range = validRange(entry);
    if (range) blocks.push(range);
    if (blocks.length >= MAX_PLAN_ENTRIES) break;
  }

  const datePrices: PrePublishDatePrice[] = [];
  for (const entry of Array.isArray(input.datePrices) ? input.datePrices : []) {
    const range = validRange(entry);
    if (!range) continue;
    const rate = finiteNumber((entry as Record<string, unknown>).nightlyRate);
    if (rate === null || rate <= 0 || rate > MAX_NIGHTLY_RATE) continue;
    datePrices.push({ ...range, nightlyRate: Math.round(rate * 100) / 100 });
    if (datePrices.length >= MAX_PLAN_ENTRIES) break;
  }

  const offers: PrePublishOffer[] = [];
  for (const entry of Array.isArray(input.offers) ? input.offers : []) {
    const range = validRange(entry);
    if (!range) continue;
    const raw = entry as Record<string, unknown>;
    const type =
      raw.type === "FREE_CLEANING" ? "FREE_CLEANING" : "PERCENT_DISCOUNT";
    if (type === "PERCENT_DISCOUNT") {
      const percent = finiteNumber(raw.discountPercent);
      if (
        percent === null ||
        !Number.isInteger(percent) ||
        percent < MIN_OFFER_PERCENT ||
        percent > MAX_OFFER_PERCENT
      ) {
        continue;
      }
      offers.push({ ...range, type, discountPercent: percent });
    } else {
      offers.push({ ...range, type, discountPercent: 0 });
    }
    if (offers.length >= MAX_PLAN_ENTRIES) break;
  }

  return { blocks, datePrices, offers };
}

export function isEmptyPrePublishPlan(plan: PrePublishPlan): boolean {
  return (
    plan.blocks.length === 0 &&
    plan.datePrices.length === 0 &&
    plan.offers.length === 0
  );
}

/**
 * Date-specific prices are stored one row per day, so overlapping ranges have to be
 * flattened before they reach the database — the later entry wins, which matches what
 * the host sees when they set a price over dates they already priced.
 */
export function flattenPlanDatePrices(
  datePrices: PrePublishDatePrice[]
): { date: PlanDate; nightlyRate: number }[] {
  const byDate = new Map<PlanDate, number>();
  for (const entry of datePrices) {
    for (const date of eachPlanDate(entry.startDate, entry.endDate)) {
      byDate.set(date, entry.nightlyRate);
      if (byDate.size > MAX_PLAN_DATE_PRICE_DAYS) break;
    }
  }
  return [...byDate.entries()]
    .slice(0, MAX_PLAN_DATE_PRICE_DAYS)
    .map(([date, nightlyRate]) => ({ date, nightlyRate }));
}

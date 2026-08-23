/**
 * The rules behind the create flow's capacity step — guests, bedrooms, beds and
 * bathrooms.
 *
 * The bounds are `listingFormSchema`'s own (`maxGuests` 1–20, `bedrooms` and
 * `bathrooms` 0–20, `beds` 0–40), restated as constants for the same reason
 * `listing-basics` restates the title limits: a Zod schema built for one `FormData`
 * submission cannot draw a stepper, cap a counter, or tell the Review screen which row
 * to link to. The guest bounds are imported from `listing-house-rules` rather than
 * written twice, because the House rules step edits the very same field later in the
 * flow and the two screens must never disagree about it.
 *
 * Free of i18n and JSX so the rules can be unit tested directly; the caller turns an
 * issue code into a sentence.
 */

import { MAX_GUESTS_MAX, MAX_GUESTS_MIN } from "@/lib/host/v2/listing-house-rules";

export { MAX_GUESTS_MAX, MAX_GUESTS_MIN };

export const BEDROOMS_MIN = 0;
export const BEDROOMS_MAX = 20;
export const BEDS_MIN = 0;
export const BEDS_MAX = 40;
export const BATHROOMS_MIN = 0;
export const BATHROOMS_MAX = 20;

/** The four counts the step owns, in the order it draws them. */
export const CAPACITY_FIELDS = ["guests", "bedrooms", "beds", "bathrooms"] as const;

export type CapacityField = (typeof CAPACITY_FIELDS)[number];

export type CapacityIssue = "NOT_A_NUMBER" | "TOO_LOW" | "TOO_HIGH";

export interface ListingCapacityInput {
  guests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
}

export type ListingCapacityIssues = Partial<Record<CapacityField, CapacityIssue>>;

export const CAPACITY_BOUNDS: Record<CapacityField, { min: number; max: number }> = {
  guests: { min: MAX_GUESTS_MIN, max: MAX_GUESTS_MAX },
  bedrooms: { min: BEDROOMS_MIN, max: BEDROOMS_MAX },
  beds: { min: BEDS_MIN, max: BEDS_MAX },
  bathrooms: { min: BATHROOMS_MIN, max: BATHROOMS_MAX },
};

/**
 * A stored draft string as the number the stepper starts on.
 *
 * A draft written by the classic wizard carries `""` for a count the host never
 * reached, and `Number("")` is `0` — a finite number that sails past an
 * `Number.isFinite` guard and lands the guest counter on zero, which publishing then
 * refuses. Blank and unparseable both fall back to the caller's default, and anything
 * real is clamped into the bounds the server enforces.
 */
export function capacityCountFromDraft(
  raw: string | undefined,
  field: CapacityField,
  fallback: number,
): number {
  const text = (raw ?? "").trim();
  const parsed = text === "" ? Number.NaN : Number(text);
  return clampCapacity(Number.isFinite(parsed) ? parsed : fallback, field);
}

/** Keeps a stepper inside the bounds publishing enforces. */
export function clampCapacity(value: number, field: CapacityField): number {
  const { min, max } = CAPACITY_BOUNDS[field];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function fieldIssue(value: number, field: CapacityField): CapacityIssue | undefined {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return "NOT_A_NUMBER";
  const { min, max } = CAPACITY_BOUNDS[field];
  if (value < min) return "TOO_LOW";
  if (value > max) return "TOO_HIGH";
  return undefined;
}

/** Everything wrong with the four counts, in one pass. */
export function listingCapacityIssues(
  input: ListingCapacityInput,
): ListingCapacityIssues {
  const issues: ListingCapacityIssues = {};
  for (const field of CAPACITY_FIELDS) {
    const issue = fieldIssue(input[field], field);
    if (issue) issues[field] = issue;
  }
  return issues;
}

/** Whether the step is done. */
export function listingCapacityComplete(input: ListingCapacityInput): boolean {
  return Object.keys(listingCapacityIssues(input)).length === 0;
}

/**
 * The rules behind the create flow's availability step.
 *
 * The step asks the one question the pre-publish screen has always asked — when can
 * guests book? — so the answer is modelled with the canonical vocabulary in
 * `@/lib/types/listing-availability-start` rather than a second shape that would have
 * to be translated later. What this module adds is the *form* state: a mode that may
 * still be unanswered, a date field that may still be half-typed, and a minimum stay,
 * turned into the one issue code the screen shows.
 *
 * Kept free of i18n and JSX so the rules can be tested directly, the same way
 * `listing-basics` is — the caller turns an issue code into a sentence.
 *
 * Nothing here saves anything. The whole create flow is still UI-only.
 */

import {
  parseAvailabilityStart,
  validateAvailabilityStartForPublish,
  type AvailabilityStartChoice,
} from "@/lib/types/listing-availability-start";

/** The three answers, in the order the screen offers them. */
export const AVAILABILITY_MODES = ["now", "from", "selected"] as const;

export type AvailabilityMode = (typeof AVAILABILITY_MODES)[number];

/**
 * Minimum stay bounds.
 *
 * One night up to `Listing.maxNights`' own default of 365 — the same range the calendar
 * editor validates a minimum stay against (`positiveInteger(value, pricing.maxNights)`
 * in `calendar-listing-draft`). Onboarding cannot know a listing's real `maxNights`
 * because no listing exists yet, so it uses the default the row would be created with.
 */
export const MIN_STAY_MIN = 1;
export const MIN_STAY_MAX = 365;

/** What the screen holds while the host is still answering. */
export interface AvailabilityStepForm {
  /** `null` is "not answered yet", never a silent "available now". */
  mode: AvailabilityMode | null;
  /** Raw field text, so a half-typed date is a no-op rather than an answer. */
  startDate: string;
}

export type AvailabilityStepIssue =
  | "UNANSWERED"
  | "MISSING_DATE"
  | "INVALID_DATE"
  | "PAST_DATE";

/**
 * The form as the canonical choice, or `null` when it is not one yet.
 *
 * Goes through `parseAvailabilityStart` rather than casting, so a date this screen
 * accepts is exactly a date the publish gate accepts.
 */
export function availabilityStepChoice(
  form: AvailabilityStepForm,
): AvailabilityStartChoice {
  if (!form.mode) return null;
  if (form.mode === "from") {
    return parseAvailabilityStart({ mode: "from", startDate: form.startDate.trim() });
  }
  return parseAvailabilityStart({ mode: form.mode });
}

/**
 * What is still wrong, or `undefined` when the host may move on.
 *
 * The publish gate is the authority on whether an answer holds; this only splits its
 * "unconfirmed" into the two things it means on a form — no option picked at all, and
 * an option picked whose date box is still empty — because those send the host to
 * different places on the screen.
 */
export function availabilityStepIssue(
  form: AvailabilityStepForm,
  today?: string,
): AvailabilityStepIssue | undefined {
  if (!form.mode) return "UNANSWERED";
  if (form.mode === "from" && form.startDate.trim() === "") return "MISSING_DATE";

  const result = validateAvailabilityStartForPublish(
    availabilityStepChoice(form),
    today,
  );
  if (result.ok) return undefined;
  if (result.reason === "past-date") return "PAST_DATE";
  // "unconfirmed" can only be reached here with a `from` whose date failed to parse:
  // both other modes are always valid, and an empty date was answered above.
  return form.mode === "from" ? "INVALID_DATE" : "UNANSWERED";
}

/** Whether Next may navigate. */
export function availabilityStepComplete(
  form: AvailabilityStepForm,
  today?: string,
): boolean {
  return availabilityStepIssue(form, today) === undefined;
}

/** Keeps a stepper inside the bounds the calendar editor would enforce later. */
export function clampMinStay(nights: number): number {
  if (!Number.isFinite(nights)) return MIN_STAY_MIN;
  return Math.min(MIN_STAY_MAX, Math.max(MIN_STAY_MIN, Math.round(nights)));
}

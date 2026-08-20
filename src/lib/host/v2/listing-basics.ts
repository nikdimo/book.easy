/**
 * The rules behind the Title & description section.
 *
 * The limits are the ones the classic listing form has always enforced
 * (`listingFormSchema`), restated here rather than imported because this module has to
 * run in three places at once: the client, to draw a counter and an inline error before
 * anything is sent; the server action, to reject what the client let through; and the
 * page, to decide whether the section counts as complete. A Zod schema built for one
 * `FormData` submission answers none of those well.
 *
 * Kept free of i18n and JSX so the rules can be tested directly — the caller turns an
 * issue code into a sentence in the host's language.
 */

export const TITLE_MIN = 5;
export const TITLE_MAX = 100;
export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 5000;

export type BasicsIssue = "EMPTY" | "TOO_SHORT" | "TOO_LONG";

export interface ListingBasicsInput {
  title: string;
  description: string;
}

export interface ListingBasicsIssues {
  title?: BasicsIssue;
  description?: BasicsIssue;
}

/**
 * What actually gets stored and measured.
 *
 * Surrounding whitespace is never part of what a host meant to write, and counting it
 * would let a description of twenty spaces pass a twenty-character minimum. Interior
 * line breaks are left alone: paragraphs are the point of a description.
 */
export function normalizeListingBasics(input: ListingBasicsInput): ListingBasicsInput {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
  };
}

function fieldIssue(value: string, min: number, max: number): BasicsIssue | undefined {
  if (value.length === 0) return "EMPTY";
  if (value.length < min) return "TOO_SHORT";
  if (value.length > max) return "TOO_LONG";
  return undefined;
}

/** Issues for both fields at once — an autosave reports everything wrong in one pass
 *  rather than making the host fix one field to discover the next. Input is normalized
 *  here, so callers can pass raw editor values. */
export function listingBasicsIssues(input: ListingBasicsInput): ListingBasicsIssues {
  const { title, description } = normalizeListingBasics(input);
  const issues: ListingBasicsIssues = {};
  const titleIssue = fieldIssue(title, TITLE_MIN, TITLE_MAX);
  if (titleIssue) issues.title = titleIssue;
  const descriptionIssue = fieldIssue(description, DESCRIPTION_MIN, DESCRIPTION_MAX);
  if (descriptionIssue) issues.description = descriptionIssue;
  return issues;
}

/**
 * Whether the section is done.
 *
 * Both fields, or neither: a listing with a title and no description is still missing
 * the half a guest reads before booking, and a navigation tick against it would be a
 * lie. This is also exactly what the action accepts, so the tick and the last successful
 * save can never disagree.
 */
export function listingBasicsComplete(input: ListingBasicsInput): boolean {
  return Object.keys(listingBasicsIssues(input)).length === 0;
}

/**
 * What a save reports back.
 *
 * Declared here rather than beside the action because a `"use server"` module may only
 * export async functions, and the client's autosave reasoning needs this shape.
 */
export interface ListingBasicsSaveResult {
  /** A failure the host cannot fix in a field — not signed in, not their listing. */
  error?: string;
  /** Per-field rule violations. Present only when nothing was written. */
  issues?: ListingBasicsIssues;
  /** What the listing holds after the write, so the client can settle on the server's
   *  answer rather than assume its optimistic state was accepted. */
  title?: string;
  description?: string;
  complete?: boolean;
}

/**
 * The two decisions the Title & description autosave makes, without React around them.
 *
 * Both are the kind of thing that only shows up wrong in production — a save that fires
 * on every keystroke, or a header stuck on "Saved" after the server refused the write —
 * so they are separated from the component and tested directly.
 */

import {
  listingBasicsIssues,
  normalizeListingBasics,
  type ListingBasicsInput,
  type ListingBasicsIssues,
  type ListingBasicsSaveResult,
} from "@/lib/host/v2/listing-basics";

export type BasicsAutosavePlan =
  | { action: "skip"; reason: "unchanged" | "incomplete" }
  | { action: "save"; value: ListingBasicsInput };

/**
 * Whether this tick of the debounce should reach the server.
 *
 * Two reasons not to, and they are not the same reason. `unchanged` is the common one:
 * a blur after no edit, or a save that already landed. `incomplete` is a host still
 * typing — the field is telling them what is missing, and a request that can only come
 * back refused would put "Not saved" in the header for a draft that was never wrong.
 */
export function planBasicsAutosave(
  next: ListingBasicsInput,
  saved: ListingBasicsInput,
): BasicsAutosavePlan {
  const value = normalizeListingBasics(next);
  const current = normalizeListingBasics(saved);
  if (value.title === current.title && value.description === current.description) {
    return { action: "skip", reason: "unchanged" };
  }
  if (Object.keys(listingBasicsIssues(value)).length > 0) {
    return { action: "skip", reason: "incomplete" };
  }
  return { action: "save", value };
}

export type BasicsSaveOutcome =
  | { status: "saved"; saved: ListingBasicsInput }
  | { status: "failed"; issues?: ListingBasicsIssues; message?: string };

/**
 * Reads the action's answer.
 *
 * A result carrying `issues` is a failure even though it carries no `error`: the server
 * refused the write, and reporting it as saved would leave the host believing text that
 * is only in their browser is on their listing. The server's own values win on success,
 * so what the client calls "last saved" is what was actually stored.
 */
export function readBasicsSaveResult(
  sent: ListingBasicsInput,
  result: ListingBasicsSaveResult,
): BasicsSaveOutcome {
  if (result.error) return { status: "failed", message: result.error };
  if (result.issues && Object.keys(result.issues).length > 0) {
    return { status: "failed", issues: result.issues };
  }
  return {
    status: "saved",
    saved: {
      title: result.title ?? sent.title,
      description: result.description ?? sent.description,
    },
  };
}

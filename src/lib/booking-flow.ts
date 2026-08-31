export type GuestStepDestination = "dates" | "review" | null;

/**
 * Chooses where the guest-count action leads.
 *
 * Search has no review step and finishes outside the picker. A listing does have
 * one, but cannot enter it until the exact stay has passed availability and
 * minimum-stay validation, so an incomplete stay returns to the calendar.
 */
export function guestStepDestination(
  hasReviewStep: boolean,
  reviewStepEnabled: boolean,
): GuestStepDestination {
  if (!hasReviewStep) return null;
  return reviewStepEnabled ? "review" : "dates";
}

export type DatesStepDestination = "guests" | "review" | null;

/**
 * Chooses where the calendar's forward action leads.
 *
 * It used to go to the guest counts every time, which turned a guest who stepped back
 * from the party to fix their dates into a loop: forward landed on the counts they had
 * just filled in, and forward from there came back to the calendar. A party that has
 * already been answered is not asked again — the stay goes on to the review, which is
 * the step the request is actually sent from.
 *
 * An unanswered party still comes first, and a stay the review cannot accept yet (too
 * short, or no longer free) still returns to the counts rather than to a review that
 * would refuse it, with the calendar's own minimum-stay note left showing.
 */
export function datesStepDestination(
  showGuestStep: boolean,
  guestsAnswered: boolean,
  hasReviewStep: boolean,
  reviewStepEnabled: boolean,
): DatesStepDestination {
  if (showGuestStep && !guestsAnswered) return "guests";
  if (hasReviewStep && reviewStepEnabled) return "review";
  return showGuestStep ? "guests" : null;
}

/**
 * Drops pets from a party the host does not take them from.
 *
 * The counts reach the widget from the URL as well as from the picker, so a link
 * carrying `pets=2` would otherwise seat a pet at a listing whose house rules say no.
 * Returns the counts unchanged when there is nothing to drop, so React state that is
 * already correct keeps its identity.
 */
export function applyPetPolicy<T extends { pets: number }>(
  counts: T,
  petsAllowed: boolean,
): T {
  if (petsAllowed || counts.pets === 0) return counts;
  return { ...counts, pets: 0 };
}

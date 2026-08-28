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

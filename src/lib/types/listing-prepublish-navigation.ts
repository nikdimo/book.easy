/**
 * Where the host came from when they opened a pre-publish task, and therefore where
 * closing it has to put them back.
 *
 * The three tasks used to have exactly one entrance — the checklist after the last
 * numbered step — so "back" could simply mean "the checklist". Date pricing now also
 * opens from the Pricing step, and a host who taps "Set date prices" there and then
 * closes the calendar must land back on Pricing; dropping them on the pre-publish
 * checklist would skip them past two steps they haven't filled in yet.
 *
 * Kept free of React so the rule can be tested on its own.
 */

export type PrePublishNavTask = "availability" | "pricing" | "offers";
/** `"availability-start"` is the required "When can guests book?" screen that sits
 *  between the last numbered step and the checklist. It is a screen rather than a task:
 *  the host has to pass through it, and it has its own way onwards. */
export type PrePublishNavScreen =
  | "menu"
  | "availability-start"
  | PrePublishNavTask;

/** `"menu"` — opened from the pre-publish checklist. `"pricing-step"` — opened from the
 *  date-pricing call to action on the wizard's Pricing step. `"availability-start"` —
 *  the blocking calendar opened from the availability-confirmation screen. */
export type PrePublishOrigin =
  | "menu"
  | "pricing-step"
  | "offer-step"
  | "availability-start";

export type PrePublishTaskPrimaryAction =
  | "done"
  | "block-dates"
  | "open-dates"
  | "edit-price"
  | "add-promotion";

/** The wizard footer starts as Done. A selected range temporarily turns it into the
 * editor opener for the task, then saving clears the range and restores Done. */
export function prePublishTaskPrimaryAction(
  screen: PrePublishNavScreen | null,
  hasSelection: boolean,
  opensSelectedDates = false,
  /** Closed-by-default listings only: the selection is made entirely of dates the host
   *  has already opened, so the action closes them again rather than re-opening what is
   *  already open. Lets the one calendar both open and take back. */
  selectionAlreadyOpen = false,
): PrePublishTaskPrimaryAction {
  if (!hasSelection) return "done";
  if (screen === "availability") {
    if (!opensSelectedDates) return "block-dates";
    return selectionAlreadyOpen ? "block-dates" : "open-dates";
  }
  if (screen === "pricing") return "edit-price";
  if (screen === "offers") return "add-promotion";
  return "done";
}

/**
 * The screen a Back or Done press should land on, or `null` to leave the pre-publish
 * flow entirely and return to the numbered wizard step underneath.
 *
 * `screen` being `null` means the host is already in the wizard proper, where this
 * rule does not apply.
 */
export function prePublishBackTarget(
  screen: PrePublishNavScreen | null,
  origin: PrePublishOrigin,
): PrePublishNavScreen | null {
  if (screen === null) return null;
  // The checklist itself always hands back to the last numbered step.
  if (screen === "menu") return null;
  // Backing out of the availability question returns to the wizard's last numbered
  // step. It is only ever reached forwards from there, and it is not something the
  // host can retreat from into the checklist — the checklist is on the far side of it.
  if (screen === "availability-start") return null;
  // A task opened from Pricing returns to Pricing, not to the checklist the host
  // never visited.
  if (origin === "pricing-step" || origin === "offer-step") return null;
  // Closing the blocking calendar puts the host back on the availability question they
  // opened it from, with their answer and their new blocks both still there.
  if (origin === "availability-start") return "availability-start";
  return "menu";
}

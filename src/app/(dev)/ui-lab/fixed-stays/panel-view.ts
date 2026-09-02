/**
 * Where the host is inside the Calendar's editing panel, and what it is allowed to be.
 *
 * The real panel (`@/lib/host/v2/calendar-workbench`) is a summary menu that transforms
 * into exactly one focused editor, with Back as the only way up. This is the same rule
 * for the listing-wide half of that panel — the settings that belong to the property
 * rather than to a run of selected nights — so the mockup can be read against the real
 * one without translating between two navigation models.
 *
 * The real module's scope arithmetic is deliberately not reproduced. There is no date
 * selection in this prototype, so there is no scope that can go stale underneath an
 * open editor, and inventing one would be modelling a rule this surface does not have.
 *
 * Nothing here renders or mutates anything.
 */

/** Every listing-wide destination the menu offers. */
export type ListingEditor =
  | "visibility"
  | "booking-method"
  | "pricing"
  | "promotions";

export type PanelView =
  | { kind: "menu" }
  | { kind: "editor"; editor: ListingEditor };

export const MENU_VIEW: PanelView = { kind: "menu" };

/**
 * The menu, in the order the host reads it.
 *
 * Visibility first because it decides whether any of the rest is doing anything, then
 * how the dates are sold, then what they cost, then what comes off that price.
 */
export const LISTING_MENU: readonly ListingEditor[] = [
  "visibility",
  "booking-method",
  "pricing",
  "promotions",
];

export function editorLabel(editor: ListingEditor): string {
  switch (editor) {
    case "visibility":
      return "Listing visibility";
    case "booking-method":
      return "Booking method";
    case "pricing":
      return "Default pricing";
    case "promotions":
      return "Promotions";
  }
}

export function openEditor(editor: ListingEditor): PanelView {
  return { kind: "editor", editor };
}

/** Back always means the menu. There is only ever one level to climb. */
export function backFrom(view: PanelView): PanelView {
  return view.kind === "menu" ? view : MENU_VIEW;
}

export type BookingMode = "flexible" | "fixed";

/**
 * The one line the Booking method row shows without being opened.
 *
 * A host scanning the menu wants to know two things about this listing: which of the
 * two ways it sells, and — if it sells whole stays — whether there are any left to
 * sell. The count is of stays a guest could actually be shown, which is why a switched
 * off stay and one that has gone by are not in it.
 */
export function bookingMethodSummary(
  mode: BookingMode,
  offeredCount: number,
): string {
  return mode === "flexible"
    ? "Flexible dates"
    : `Fixed stays \u00b7 ${offeredCount} offered`;
}

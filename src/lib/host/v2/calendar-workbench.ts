/**
 * Where the editing panel is, and what it is allowed to become.
 *
 * The panel used to be three accordions stacked in one column: opening any of them
 * left the other two on screen, each with its own outline, its own summary and its own
 * claim on the single save. This module replaces that with one destination at a time —
 * a summary menu that *transforms* into exactly one focused editor — and keeps the rule
 * that makes it safe expressible as arithmetic rather than as markup: an editor belongs
 * to a scope, and a view that no longer matches the scope collapses back to the menu
 * instead of quietly editing the wrong thing.
 *
 * Nothing here mutates or renders anything. It decides which destination is legal.
 */

import type { CalendarSelection } from "@/lib/host/v2/calendar-selection";

/**
 * What a change here would apply to.
 *
 * Derived from the selection alone, never stored: a panel whose scope could disagree
 * with the calendar is a panel that can save "these three nights" against every date
 * the listing will ever have.
 */
export type WorkbenchScope = "DATES" | "ALL_FUTURE";

/**
 * Every focused editor the panel can show.
 *
 * The `listing_` editors are deliberately named apart from their date counterparts.
 * "Block these nights" and "close every date by default" are different promises to the
 * guest, and the two have never been allowed to share a card; here they cannot even
 * share an identifier.
 */
export type WorkbenchEditor =
  | "availability"
  | "pricing"
  | "promotions"
  | "listing_visibility"
  | "listing_defaults"
  | "listing_promotions";

export type WorkbenchView =
  | { kind: "menu" }
  | { kind: "editor"; editor: WorkbenchEditor }
  /** The scheduled-changes list, which is a destination rather than an editor. */
  | { kind: "schedule" };

export const WORKBENCH_MENU: Readonly<Record<WorkbenchScope, readonly WorkbenchEditor[]>> =
  {
    DATES: ["availability", "pricing", "promotions"],
    ALL_FUTURE: ["listing_visibility", "listing_defaults", "listing_promotions"],
  };

export function scopeOfSelection(
  selection: CalendarSelection | null,
): WorkbenchScope {
  return selection ? "DATES" : "ALL_FUTURE";
}

export function editorScope(editor: WorkbenchEditor): WorkbenchScope {
  return WORKBENCH_MENU.DATES.includes(editor) ? "DATES" : "ALL_FUTURE";
}

/**
 * Which review a given editor's save produces.
 *
 * The one distinction the panel must never blur. `listing_defaults` holds the
 * listing-wide minimum stay, which the pricing editor links to — following that link
 * has to change the *scope*, not fold a listing-wide rule into a date-price save.
 */
export type ReviewContract = "DATE" | "LISTING";

export function reviewContractFor(editor: WorkbenchEditor): ReviewContract {
  return editorScope(editor) === "DATES" ? "DATE" : "LISTING";
}

/** The sticky primary action at the foot of each focused editor. */
export type WorkbenchCta =
  | "REVIEW_AVAILABILITY"
  | "REVIEW_PRICE"
  | "REVIEW_PROMOTION"
  | "REVIEW_VISIBILITY"
  | "REVIEW_DEFAULTS"
  | "REVIEW_ONGOING_PROMOTION";

export function ctaForEditor(editor: WorkbenchEditor): WorkbenchCta {
  switch (editor) {
    case "availability":
      return "REVIEW_AVAILABILITY";
    case "pricing":
      return "REVIEW_PRICE";
    case "promotions":
      return "REVIEW_PROMOTION";
    case "listing_visibility":
      return "REVIEW_VISIBILITY";
    case "listing_defaults":
      return "REVIEW_DEFAULTS";
    case "listing_promotions":
      return "REVIEW_ONGOING_PROMOTION";
  }
}

export const MENU_VIEW: WorkbenchView = { kind: "menu" };

/**
 * Open an editor, if the current scope has one.
 *
 * An out-of-scope request is refused rather than honoured against the wrong target —
 * the caller is expected to change the scope first, which is exactly what following
 * the pricing editor's minimum-stay link does.
 */
export function openEditor(
  editor: WorkbenchEditor,
  scope: WorkbenchScope,
): WorkbenchView | null {
  return editorScope(editor) === scope ? { kind: "editor", editor } : null;
}

/** Back always means the summary menu. There is only ever one level to climb. */
export function backFrom(view: WorkbenchView): WorkbenchView {
  return view.kind === "menu" ? view : MENU_VIEW;
}

/**
 * Selecting dates, or clearing them, changes what the open editor would act on.
 *
 * An editor that still belongs to the new scope stays open — retyping a nightly price
 * because the host extended the range by a day would be its own small cruelty. One that
 * does not is dropped back to the menu, so a listing-wide editor can never be left on
 * screen above a date selection it knows nothing about.
 */
export function viewAfterScopeChange(
  view: WorkbenchView,
  nextScope: WorkbenchScope,
): WorkbenchView {
  if (view.kind !== "editor") return view;
  return editorScope(view.editor) === nextScope ? view : MENU_VIEW;
}

/**
 * Whether leaving this view would throw away work.
 *
 * Only an editor can hold a draft. Backing out of the schedule list or sitting on the
 * menu has nothing to lose, so neither should ever raise the discard prompt.
 */
export function leavingLosesWork(
  view: WorkbenchView,
  hasDraft: boolean,
): boolean {
  return view.kind === "editor" && hasDraft;
}

/**
 * The existing calendar-connections management surface for a listing.
 *
 * A link, not a reimplementation. Feeds, sync schedules and their failure states are
 * real business logic that already lives behind this route; a second copy inside the
 * calendar panel would be a second thing to keep correct, and the two would disagree
 * the first time either changed. The panel's job here is only to make the destination
 * findable from where the host noticed they needed it.
 */
export function listingConnectionsHref(listingId: string): string {
  return `/host/listings/${listingId}/availability`;
}

/** Where the pricing editor's quiet minimum-stay row sends the host. */
export const MINIMUM_STAY_TARGET = {
  scope: "ALL_FUTURE",
  editor: "listing_defaults",
} as const satisfies { scope: WorkbenchScope; editor: WorkbenchEditor };

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
 * **The calendar edits dates.** It used to carry a second set of editors for the
 * listing's own defaults — the base price, the cleaning fee, the minimum stay, the
 * always-active offers, whether an untouched date starts open. Those are listing-wide
 * settings, and they now live in the listing editor's Availability and Pricing
 * sections, which is where a host goes to change what the listing *is*. What is left
 * here is what only the calendar can answer: what happens on these particular nights.
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
 *
 * `ALL_FUTURE` no longer has editors of its own — it is the state in which the panel
 * reports the listing's defaults and links to the pages that own them. It is still a
 * scope rather than a boolean because `viewAfterScopeChange` has to close a date
 * editor the moment the dates go away, which is exactly the same rule as before.
 */
export type WorkbenchScope = "DATES" | "ALL_FUTURE";

/** Every focused editor the panel can show. All three are about selected dates. */
export type WorkbenchEditor = "availability" | "pricing" | "promotions";

export type WorkbenchView =
  | { kind: "menu" }
  | { kind: "editor"; editor: WorkbenchEditor }
  /** The scheduled-changes list, which is a destination rather than an editor. */
  | { kind: "schedule" }
  /** Connected calendars: also a destination, and the one that stages nothing. */
  | { kind: "connections" };

export const WORKBENCH_MENU: Readonly<Record<WorkbenchScope, readonly WorkbenchEditor[]>> =
  {
    DATES: ["availability", "pricing", "promotions"],
    // Deliberately empty. With no dates chosen there is nothing this panel is entitled
    // to change, so it offers context and two links out rather than a second home for
    // settings the listing editor owns.
    ALL_FUTURE: [],
  };

export function scopeOfSelection(
  selection: CalendarSelection | null,
): WorkbenchScope {
  return selection ? "DATES" : "ALL_FUTURE";
}

export function editorScope(editor: WorkbenchEditor): WorkbenchScope {
  // Keep the parameter in the API: callers use this function as the single authority
  // for whether a destination belongs to the current scope, and adding a future
  // editor should require making that decision here.
  void editor;
  return "DATES";
}

/** The sticky primary action at the foot of each focused editor. */
export type WorkbenchCta =
  | "REVIEW_AVAILABILITY"
  | "REVIEW_PRICE"
  | "REVIEW_PROMOTION";

export function ctaForEditor(editor: WorkbenchEditor): WorkbenchCta {
  switch (editor) {
    case "availability":
      return "REVIEW_AVAILABILITY";
    case "pricing":
      return "REVIEW_PRICE";
    case "promotions":
      return "REVIEW_PROMOTION";
  }
}

export const MENU_VIEW: WorkbenchView = { kind: "menu" };

/**
 * Open an editor, if the current scope has one.
 *
 * An out-of-scope request is refused rather than honoured against the wrong target.
 * With no dates selected that means every editor is refused, which is what keeps an
 * arriving intent from opening a date editor before there are dates for it to act on.
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
 * does not is dropped back to the menu, so an editor can never be left on screen above
 * a selection it knows nothing about — or above no selection at all.
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
 * Connected calendars, as a view of this panel rather than another page.
 *
 * It used to be a link out to the old listing pages, which meant the host left the
 * calendar — and the property they had selected, and the month they were looking at —
 * to paste a URL, and came back to a different panel in a different shell. The sync
 * itself is not duplicated: the panel calls the same server actions the old surface
 * called, so there is still exactly one implementation of feeds and their failures.
 *
 * Nothing here is staged or reviewed. Connecting or disconnecting a calendar takes
 * effect when the host asks for it, so this view can never be holding unsaved work —
 * which is why `leavingLosesWork` above still answers "no" for it.
 */
export const CONNECTIONS_VIEW: WorkbenchView = { kind: "connections" };

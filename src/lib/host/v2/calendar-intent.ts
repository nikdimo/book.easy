/**
 * What it means to arrive at the calendar *for* something.
 *
 * The listing editor owns the listing-wide settings now, so its links into the calendar
 * are all half a sentence: "set prices for specific dates", "open or block specific
 * dates", "create a date-based offer". Each of them names an action the calendar can
 * only carry out once the host has said *which* dates — so the link carries the verb
 * and the calendar asks for the nouns.
 *
 * This module is that handover, as arithmetic rather than as effects. It decides what
 * the calendar is showing the moment it loads, and what the first selection turns that
 * into. Nothing here reads the URL, touches state, or renders: the page parses the
 * query, this decides what it means, and the workspace holds the result.
 *
 * An intent is never a permission. Every editor it can open acts on selected dates and
 * on nothing else, and the actions behind those editors re-check ownership on the
 * server regardless of how the host got here.
 */

import type { CalendarHrefRange, CalendarIntent } from "@/lib/host/v2/calendar-href";
import {
  clampSelectionToHorizon,
  type CalendarSelection,
} from "@/lib/host/v2/calendar-selection";
import {
  MENU_VIEW,
  openEditor,
  scopeOfSelection,
  type WorkbenchEditor,
  type WorkbenchView,
} from "@/lib/host/v2/calendar-workbench";

/**
 * Which selected-date editor each intent asks for.
 *
 * Every value is a `DATES` editor, which is the property that makes an intent safe to
 * honour: it cannot open anything that would change the listing as a whole, however
 * the link was constructed.
 */
export const EDITOR_FOR_INTENT: Record<CalendarIntent, WorkbenchEditor> = {
  availability: "availability",
  pricing: "pricing",
  promotion: "promotions",
};

export interface CalendarArrival {
  /** Dates to start with, from the link, clamped to what the calendar renders. */
  selection: CalendarSelection | null;
  /** The panel's opening destination. */
  view: WorkbenchView;
  /**
   * The intent still waiting for dates, or null.
   *
   * Non-null exactly when the calendar is in its "select dates for this action" state:
   * the host asked for something, and the answer needs a selection the link did not
   * supply. Once honoured — or declined — it is null and the calendar behaves normally.
   */
  pendingIntent: CalendarIntent | null;
}

/**
 * The calendar's opening state, given what the link asked for.
 *
 * A link that already knows its dates (a dated offer being opened from the Pricing
 * summary) lands with them selected and its editor open — there is nothing left to ask.
 * A link that does not lands on the menu, holding the intent, with the dates still to
 * come. An intent with no property to apply it to is dropped: the calendar would be
 * showing the portfolio overview, which has no dates to select.
 */
export function calendarArrival({
  intent,
  range,
  hasListing,
  today,
  horizonEnd,
}: {
  intent: CalendarIntent | null;
  range: CalendarHrefRange | null;
  /** Whether a real listing of this host's was resolved from `?listing=`. */
  hasListing: boolean;
  today: string;
  /** Exclusive end of the rendered horizon. */
  horizonEnd: string;
}): CalendarArrival {
  if (!hasListing) {
    return { selection: null, view: MENU_VIEW, pendingIntent: null };
  }

  const selection = range
    ? clampSelectionToHorizon(
        { start: range.from, end: range.to },
        today,
        horizonEnd,
      )
    : null;

  if (!intent) return { selection, view: MENU_VIEW, pendingIntent: null };

  // A range that fell entirely outside the horizon leaves the intent pending rather
  // than opening an editor over no dates: the link is stale, and asking again is the
  // truthful response to that.
  const view = selection
    ? (openEditor(EDITOR_FOR_INTENT[intent], scopeOfSelection(selection)) ??
      MENU_VIEW)
    : MENU_VIEW;

  return {
    selection,
    view,
    pendingIntent: view.kind === "editor" ? null : intent,
  };
}

/**
 * What a fresh selection does to a pending intent.
 *
 * The first valid selection is the answer the intent was waiting for, so the editor
 * opens by itself — a host who followed "set prices for specific dates" and then had to
 * pick "Nightly price" out of a menu was being asked the same question twice. Clearing
 * the selection is not an answer, so the intent stays pending and the prompt returns.
 */
export function viewForPendingIntent(
  intent: CalendarIntent | null,
  selection: CalendarSelection | null,
): WorkbenchView | null {
  if (!intent || !selection) return null;
  return openEditor(EDITOR_FOR_INTENT[intent], scopeOfSelection(selection));
}

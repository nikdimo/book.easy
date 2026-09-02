/**
 * The host's whole stays, as the guest's browser works with them.
 *
 * This is the client-side half of the server's guest projection
 * (`getGuestFixedStayPeriods`): the same four facts, and no more. Past and switched-off
 * stays never reach here — the server drops them — so nothing in this file has to know
 * what "past" or "disabled" mean, and nothing in the browser can resurrect one.
 *
 * Deliberately says nothing about *why* a stay is unavailable. The projection does not
 * carry that, and it should not: whether a guest is looking at someone else's booking, a
 * host's manual block or an imported calendar is the host's business, and one neutral
 * "Unavailable" is the whole of what a guest needs.
 *
 * There is no price here either. A stay is two dates; what it costs is the listing's
 * existing nightly rate, date overrides, cleaning fee and promotions, quoted by
 * `computeStayQuote` exactly as for a flexible stay.
 */

/** One stay on offer, exactly as `GuestFixedStayPeriodView` serializes it. */
export interface GuestFixedStayOption {
  id: string;
  /** `YYYY-MM-DD`. */
  checkIn: string;
  /** `YYYY-MM-DD`, exclusive — the day the guest leaves. */
  checkOut: string;
  nights: number;
  /** False when the nights are already held. Still shown, never choosable. */
  selectable: boolean;
}

export interface FixedStayOptionMonth {
  /** `YYYY-MM`, for a stable key and for ordering. */
  month: string;
  items: GuestFixedStayOption[];
}

/**
 * The stays split into the months they start in.
 *
 * A season is fifteen to thirty dated rows, and an undivided list of them is a wall:
 * every line begins with a weekday and a month, so nothing tells the eye where July ends.
 * Order is preserved from the input, which the server already sorted by check-in and then
 * by length — so this groups without ever reordering.
 */
export function groupFixedStayOptionsByMonth(
  options: readonly GuestFixedStayOption[],
): FixedStayOptionMonth[] {
  const groups: FixedStayOptionMonth[] = [];
  for (const option of options) {
    const month = option.checkIn.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.month === month) {
      last.items.push(option);
      continue;
    }
    groups.push({ month, items: [option] });
  }
  return groups;
}

/**
 * The stay this id refers to, but only if a guest may actually take it.
 *
 * One function for both questions on purpose. Every caller that wants a selected stay
 * wants a *bookable* one: a remembered id whose stay has since been booked, and an id
 * that was never on this listing at all, are the same answer here — nothing.
 */
export function findSelectableFixedStayOption(
  options: readonly GuestFixedStayOption[],
  id: string | null | undefined,
): GuestFixedStayOption | null {
  if (!id) return null;
  return (
    options.find((option) => option.id === id && option.selectable) ?? null
  );
}

export function selectableFixedStayOptions(
  options: readonly GuestFixedStayOption[],
): GuestFixedStayOption[] {
  return options.filter((option) => option.selectable);
}

export function hasSelectableFixedStayOption(
  options: readonly GuestFixedStayOption[],
): boolean {
  return options.some((option) => option.selectable);
}

/**
 * The selection state, in the shape `validateBookingSelection` returns.
 *
 * Fixed stays are measured against nothing: the host chose the dates and the length when
 * they put the stay on sale, so there is no minimum, no maximum and no blocked-night test
 * left for the browser to make. A stay is chosen or it is not, and the server is still
 * the one that decides whether it is genuinely free at the moment the request lands.
 *
 * Returning the same shape is what lets the widget's card, buttons and review read one
 * variable in both modes rather than branching in a dozen places.
 */
export function fixedStaySelectionStatus(
  option: GuestFixedStayOption | null,
): { status: "valid" | "incomplete"; nights: number } {
  return option
    ? { status: "valid", nights: option.nights }
    : { status: "incomplete", nights: 0 };
}

/**
 * The stay half of a booking request's form data.
 *
 * One function so there is one place that decides which fields a request carries, and so
 * it cannot carry both: the server refuses a period id sent beside a date — rightly,
 * since which one is authoritative would be unanswerable — and a widget assembling the
 * payload by hand in two branches is how the two would eventually drift.
 *
 * A fixed stay sends its id and no dates at all. The dates a guest is looking at came
 * from the server's own row, and sending them back would only invite the server to
 * choose between two copies of the same fact.
 */
export type BookingStayFormSelection =
  | { fixedStayPeriodId: string }
  | { checkIn: string; checkOut: string };

export function bookingStayFormFields(
  selection: BookingStayFormSelection,
): Record<string, string> {
  return "fixedStayPeriodId" in selection
    ? { fixedStayPeriodId: selection.fixedStayPeriodId }
    : { checkIn: selection.checkIn, checkOut: selection.checkOut };
}

/** The query parameter a matched fixed stay travels to the listing page on. */
export const FIXED_STAY_PERIOD_PARAM = "fixedStayPeriodId";

/**
 * The link from a search result to its listing page.
 *
 * A flexible result keeps the search's own query byte for byte — the dates a guest
 * searched are the dates its page should open on, and nothing here touches that.
 *
 * A fixed-stay result is different in both directions. Its dates come out, because a
 * range is not a selection on a listing that offers no ranges and the page is required
 * to ignore them; and the matched stay's id goes in, so the page can open on the stay the
 * guest actually found. The id is a *pointer*, not a selection: the page re-checks it
 * against its own projection and preselects nothing if it no longer holds.
 *
 * Only that listing's own match travels. There is no global parameter here that could
 * follow a guest onto a card it does not belong to.
 */
export function listingSearchLinkQuery(
  searchQuery: string | undefined,
  listing: {
    bookingMode?: string | null;
    matchedFixedStayPeriodId?: string | null;
  },
): string {
  if (listing.bookingMode !== "FIXED_STAYS") return searchQuery ?? "";

  const params = new URLSearchParams(searchQuery ?? "");
  params.delete("checkIn");
  params.delete("checkOut");
  params.delete(FIXED_STAY_PERIOD_PARAM);
  if (listing.matchedFixedStayPeriodId) {
    params.set(FIXED_STAY_PERIOD_PARAM, listing.matchedFixedStayPeriodId);
  }
  return params.toString();
}

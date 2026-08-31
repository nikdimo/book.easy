/**
 * The one way to open the Host V2 calendar on a particular listing.
 *
 * The link was being rebuilt by hand in three places — the editor header, the Pricing
 * summary and the Availability summary — which is three chances for one of them to
 * point at the classic host calendar, or to forget to escape the id. It is a single
 * function now, and the parameter names live beside it so the page that reads the
 * query cannot drift from the pages that write it.
 *
 * Nothing here authorizes anything. `?listing=` is a request: the calendar page hands
 * it to a workspace payload that is already scoped to the signed-in host, so an id
 * belonging to someone else simply is not in the payload and the default property is
 * shown instead. The parsers below only throw out values that could not be what they
 * claim to be, so obvious junk never reaches that lookup.
 */

import { compareYmd, isValidYmd } from "@/lib/utils/date-only";

export const HOST_CALENDAR_PATH = "/host/calendar";

/** The query parameter the calendar reads its selected listing from. */
export const CALENDAR_LISTING_PARAM = "listing";

/**
 * The query parameter that says *why* the host arrived.
 *
 * The listing editor owns the listing-wide defaults now, so its contextual links are
 * the main way into the calendar: "set prices for specific dates" is a sentence about
 * dates the host has not chosen yet. The intent carries that half-finished sentence
 * across the navigation so the calendar can ask for the missing half instead of
 * dropping the host on a menu that has forgotten what they came to do.
 */
export const CALENDAR_INTENT_PARAM = "intent";

/** Where the selection should start, when the link already knows the range. */
export const CALENDAR_FROM_PARAM = "from";
/** The inclusive last date of that range. */
export const CALENDAR_TO_PARAM = "to";

/**
 * Every intent the calendar understands.
 *
 * Deliberately a closed set that names *editors the calendar actually has* for the
 * selected dates. There is no "defaults" intent, because the calendar no longer edits
 * defaults — that link goes to the listing editor instead, not to a query parameter.
 */
export const CALENDAR_INTENTS = ["availability", "pricing", "promotion"] as const;

export type CalendarIntent = (typeof CALENDAR_INTENTS)[number];

/** The range a deep link can carry, as inclusive civil dates. */
export interface CalendarHrefRange {
  from: string;
  /** Inclusive last date — what the grid highlights, not an exclusive boundary. */
  to: string;
}

/** cuid/uuid shaped. Deliberately narrow: an id is generated, never typed. */
const LISTING_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** The Host V2 calendar, opened on `listingId` when one is given. */
export function hostCalendarHref(
  listingId?: string | null,
  options?: {
    /** Which selected-date editor to open once the host has picked dates. */
    intent?: CalendarIntent | null;
    /** Dates to preselect, when the caller already knows them. */
    range?: CalendarHrefRange | null;
  },
): string {
  const id = listingId?.trim();
  const params = new URLSearchParams();
  if (id) params.set(CALENDAR_LISTING_PARAM, id);
  if (options?.intent) params.set(CALENDAR_INTENT_PARAM, options.intent);
  // A range without a listing would be a selection on whichever property the calendar
  // happened to open, which is not what any caller means by it.
  const range = id ? normalizedRange(options?.range) : null;
  if (range) {
    params.set(CALENDAR_FROM_PARAM, range.from);
    params.set(CALENDAR_TO_PARAM, range.to);
  }
  const query = params.toString();
  return query ? `${HOST_CALENDAR_PATH}?${query}` : HOST_CALENDAR_PATH;
}

function normalizedRange(
  range: CalendarHrefRange | null | undefined,
): CalendarHrefRange | null {
  if (!range) return null;
  const from = range.from?.trim();
  const to = range.to?.trim();
  if (!from || !to) return null;
  // Shape alone is not enough: values such as 2026-02-31 sort correctly but are not
  // dates the calendar can render. Validate the civil date before comparing it.
  if (!isValidYmd(from) || !isValidYmd(to)) return null;
  // Written the way it is read. A backwards range is dropped rather than swapped:
  // the caller has a bug, and silently repairing it hides that.
  return compareYmd(from, to) <= 0 ? { from, to } : null;
}

/**
 * The `?listing=` value, narrowed to something worth looking up.
 *
 * Next hands repeated parameters over as an array; anything that is not a single
 * id-shaped string is dropped rather than passed on, so a crafted value never reaches
 * a query and never decides what the calendar renders.
 */
export function parseCalendarListingParam(
  value: string | string[] | undefined,
): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return LISTING_ID_PATTERN.test(id) ? id : null;
}

/**
 * The `?intent=` value, or null.
 *
 * Same rule as the listing id, and for the same reason: a repeated parameter arrives
 * as an array and an unknown word is not an intent. The calendar puts itself into a
 * "select dates for this action" state from this value, so an unrecognised one has to
 * mean "no intent" rather than "some intent we will guess at".
 */
export function parseCalendarIntentParam(
  value: string | string[] | undefined,
): CalendarIntent | null {
  if (typeof value !== "string") return null;
  const intent = value.trim();
  return (CALENDAR_INTENTS as readonly string[]).includes(intent)
    ? (intent as CalendarIntent)
    : null;
}

/**
 * The `?from=`/`?to=` pair, as an inclusive range the grid can select.
 *
 * Both halves are required: half a range is not a range, and preselecting a single
 * arbitrary day because the other parameter was dropped would put the host on dates
 * nobody asked for. Nothing here checks the dates are in the calendar's horizon — the
 * workspace clamps its own selection, and this parser's job is shape, not policy.
 */
export function parseCalendarRangeParams(
  from: string | string[] | undefined,
  to: string | string[] | undefined,
): CalendarHrefRange | null {
  if (typeof from !== "string" || typeof to !== "string") return null;
  return normalizedRange({ from, to });
}

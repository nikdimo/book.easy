/**
 * The one way to open the Host V2 calendar on a particular listing.
 *
 * The link was being rebuilt by hand in three places — the editor header, the Pricing
 * summary and the Availability summary — which is three chances for one of them to
 * point at the classic host calendar, or to forget to escape the id. It is a single
 * function now, and the parameter name lives beside it so the page that reads the
 * query cannot drift from the pages that write it.
 *
 * Nothing here authorizes anything. `?listing=` is a request: the calendar page hands
 * it to a workspace payload that is already scoped to the signed-in host, so an id
 * belonging to someone else simply is not in the payload and the default property is
 * shown instead. `parseCalendarListingParam` only throws out values that could not be
 * an id at all, so obvious junk never reaches that lookup.
 */

export const HOST_CALENDAR_PATH = "/host/calendar";

/** The query parameter the calendar reads its selected listing from. */
export const CALENDAR_LISTING_PARAM = "listing";

/** cuid/uuid shaped. Deliberately narrow: an id is generated, never typed. */
const LISTING_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** The Host V2 calendar, opened on `listingId` when one is given. */
export function hostCalendarHref(listingId?: string | null): string {
  const id = listingId?.trim();
  if (!id) return HOST_CALENDAR_PATH;
  return `${HOST_CALENDAR_PATH}?${CALENDAR_LISTING_PARAM}=${encodeURIComponent(id)}`;
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

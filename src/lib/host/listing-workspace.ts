/**
 * Route-level stops still include each Calendar lens so deep links stay explicit.
 * Primary navigation groups those lenses under the Calendar destination below.
 *
 * This lives outside the bottom-nav component on purpose. That component is
 * "use client", and every export of a client module reaches a server component as a
 * client-reference proxy rather than the real value — so a server page importing the
 * array from there gets something it cannot call `findIndex` on.
 */
/**
 * Where the phone action row is mounted. Lives here rather than beside the portal
 * component for the same reason the stops do: the calendar page is a server
 * component, and an id imported from a "use client" module would reach it as a
 * client-reference proxy instead of the string.
 */
export const LISTING_ACTION_BAR_ID = "listing-action-bar";

/** Route-level stops. Preview remains addressable, but it is a supporting action
 * rather than one of the four editing destinations. */
export type ListingWorkspaceStop =
  | "preview"
  | "edit"
  | "availability"
  | "pricing"
  | "promotions";

export type ListingPrimaryDestination =
  | "listing"
  | "availability"
  | "pricing"
  | "promotions";

/** Creation teaches these same four ownership buckets. Existing-listing management
 * exposes them directly so a host never has to remember that three unrelated jobs
 * were hidden below a generic Calendar destination. */
export const LISTING_PRIMARY_DESTINATIONS: {
  destination: ListingPrimaryDestination;
  stop: ListingWorkspaceStop;
  label: string;
}[] = [
  { destination: "listing", stop: "edit", label: "Listing" },
  { destination: "availability", stop: "availability", label: "Availability" },
  { destination: "pricing", stop: "pricing", label: "Pricing" },
  { destination: "promotions", stop: "promotions", label: "Promotions" },
];

export const LISTING_WORKSPACE_STOPS: {
  stop: ListingWorkspaceStop;
  label: string;
  segment: string;
}[] = [
  { stop: "preview", label: "Preview", segment: "edit?pane=preview" },
  { stop: "edit", label: "Edit", segment: "edit" },
  { stop: "availability", label: "Availability", segment: "availability" },
  { stop: "pricing", label: "Pricing", segment: "pricing" },
  { stop: "promotions", label: "Promos", segment: "promotion" },
];

export function isCalendarWorkspaceStop(stop: ListingWorkspaceStop): boolean {
  return stop === "availability" || stop === "pricing" || stop === "promotions";
}

export function listingStopHref(
  listingId: string,
  stop: ListingWorkspaceStop,
): string {
  const entry = LISTING_WORKSPACE_STOPS.find((item) => item.stop === stop);
  return `/host/listings/${listingId}/${entry?.segment ?? "edit"}`;
}

/** Appends a carried-over date selection without clobbering an existing query. */
export function withSelectionQuery(href: string, selectionQuery: string) {
  if (!selectionQuery) return href;
  return href.includes("?")
    ? `${href}&${selectionQuery.replace(/^\?/, "")}`
    : `${href}${selectionQuery}`;
}

/**
 * The five screens a host moves between while working on one listing. Preview leads:
 * see the listing, change it, then manage how it sells.
 *
 * This lives outside the bottom-nav component on purpose. That component is
 * "use client", and every export of a client module reaches a server component as a
 * client-reference proxy rather than the real value — so a server page importing the
 * array from there gets something it cannot call `findIndex` on.
 */
export type ListingWorkspaceStop =
  | "preview"
  | "edit"
  | "availability"
  | "pricing"
  | "promotions";

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

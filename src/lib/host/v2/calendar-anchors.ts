/**
 * Stable handles for the calendar's important regions and actions.
 *
 * A guide that can say "this control, here" needs a name for each control that does
 * not change when the markup does. These are rendered as both `id` and
 * `data-linger-anchor`, so a future assistant can find a region without depending on
 * class names or DOM order. Nothing reads them today — they are deliberately inert.
 *
 * Treat the values as an interface: rename one and any saved reference to it breaks.
 */
export const CALENDAR_ANCHOR = {
  workspace: "host-calendar-workspace",
  safetyBanner: "host-calendar-safety-banner",
  listingRail: "host-calendar-listing-rail",
  selectedListing: "host-calendar-selected-listing",
  listingChooser: "host-calendar-listing-chooser",
  /** Choosing the set of properties an availability change applies to. */
  listingMultiSelect: "host-calendar-listing-multi-select",
  allListings: "host-calendar-all-listings",
  monthControls: "host-calendar-month-controls",
  dateGrid: "host-calendar-date-grid",
  legend: "host-calendar-legend",
  selectedRange: "host-calendar-selected-range",
  workbench: "host-calendar-workbench",
  /** The "Manage calendar" panel as a whole. */
  managePanel: "host-calendar-manage-panel",
  /** The line that says what an edit here would apply to. */
  manageScope: "host-calendar-manage-scope",
  /** The compact safety flag that replaced the full-width banner. */
  manageStatus: "host-calendar-manage-status",
  /**
   * The three cards. Each is both the collapsed summary and, once expanded, the
   * editor — so these names point at the same element in either state.
   */
  availabilityEditor: "host-calendar-availability-editor",
  priceEditor: "host-calendar-price-editor",
  stayRequirements: "host-calendar-stay-requirements",
  promotionEditor: "host-calendar-promotion-editor",
  guestQuote: "host-calendar-guest-quote",
  listingStatus: "host-calendar-listing-status",
  moreSettings: "host-calendar-more-settings",
  reviewChanges: "host-calendar-review-changes",
  reviewDialog: "host-calendar-review-dialog",
  finalSave: "host-calendar-final-save",
} as const;

export type CalendarAnchor = (typeof CALENDAR_ANCHOR)[keyof typeof CALENDAR_ANCHOR];

/** Spread onto the element that *is* the region, so `id` and the attribute agree. */
export function anchorProps(anchor: CalendarAnchor) {
  return { id: anchor, "data-linger-anchor": anchor };
}

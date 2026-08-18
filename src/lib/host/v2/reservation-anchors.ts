/**
 * Stable handles for the reservations panel's regions.
 *
 * Same contract as `calendar-anchors`: rendered as both `id` and `data-linger-anchor`
 * so a region can be pointed at without depending on class names or DOM order. Nothing
 * reads them today — they are deliberately inert, and renaming one breaks any saved
 * reference to it.
 */
export const RESERVATION_ANCHOR = {
  workspace: "host-reservations-workspace",
  propertyRail: "host-reservations-property-rail",
  selectedProperty: "host-reservations-selected-property",
  propertyChooser: "host-reservations-property-chooser",
  controls: "host-reservations-controls",
  filters: "host-reservations-filters",
  stream: "host-reservations-stream",
  /** The queue at the top of the stream. Absent when there is nothing to do. */
  actionQueue: "host-reservations-action-queue",
  panel: "host-reservations-panel",
  /** The deadline block carrying accept and decline. */
  decision: "host-reservations-decision",
  payout: "host-reservations-payout",
  history: "host-reservations-history",
} as const;

export type ReservationAnchor =
  (typeof RESERVATION_ANCHOR)[keyof typeof RESERVATION_ANCHOR];

/** Spread onto the element that *is* the region, so `id` and the attribute agree. */
export function anchorProps(anchor: ReservationAnchor) {
  return { id: anchor, "data-linger-anchor": anchor };
}

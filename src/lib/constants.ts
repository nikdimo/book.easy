/** Mirrors `ListingStatus`. Moderation is post-publication, so there is no queued or
 *  rejected listing state — an approved listing carries `needsReview` until an admin
 *  clears it, and anything unsafe is SUSPENDED. */
export const LISTING_STATUSES = [
  { value: "DRAFT", label: "Draft", color: "secondary" },
  { value: "APPROVED", label: "Approved", color: "success" },
  { value: "UNPUBLISHED", label: "Unpublished", color: "secondary" },
  { value: "SUSPENDED", label: "Suspended", color: "destructive" },
  { value: "ARCHIVED", label: "Archived", color: "secondary" },
] as const;

export const BOOKING_STATUSES = [
  { value: "PENDING", label: "Awaiting host approval", color: "warning" },
  { value: "CONFIRMED", label: "Confirmed", color: "success" },
  { value: "REJECTED", label: "Rejected", color: "destructive" },
  { value: "EXPIRED", label: "Expired", color: "secondary" },
  { value: "CANCELLED_BY_GUEST", label: "Cancelled by Guest", color: "secondary" },
  { value: "CANCELLED_BY_HOST", label: "Cancelled by Host", color: "secondary" },
  { value: "CANCELLED_BY_ADMIN", label: "Cancelled by Admin", color: "destructive" },
  { value: "COMPLETED", label: "Completed", color: "success" },
] as const;

export const DEFAULT_CURRENCY = "EUR";

export const ITEMS_PER_PAGE = 12;

export const PROPERTY_TYPES = [
  { value: "APARTMENT", label: "Apartment" },
  { value: "HOUSE", label: "House" },
  { value: "VILLA", label: "Villa" },
  { value: "STUDIO", label: "Studio" },
  { value: "CABIN", label: "Cabin" },
  { value: "COTTAGE", label: "Cottage" },
  { value: "LOFT", label: "Loft" },
  { value: "OTHER", label: "Other" },
] as const;

export const LISTING_STATUSES = [
  { value: "DRAFT", label: "Draft", color: "secondary" },
  { value: "PENDING_REVIEW", label: "Pending Review", color: "warning" },
  { value: "APPROVED", label: "Approved", color: "success" },
  { value: "REJECTED", label: "Rejected", color: "destructive" },
  { value: "UNPUBLISHED", label: "Unpublished", color: "secondary" },
  { value: "SUSPENDED", label: "Suspended", color: "destructive" },
  { value: "ARCHIVED", label: "Archived", color: "secondary" },
] as const;

export const BOOKING_STATUSES = [
  { value: "PENDING", label: "Pending", color: "warning" },
  { value: "CONFIRMED", label: "Confirmed", color: "success" },
  { value: "REJECTED", label: "Rejected", color: "destructive" },
  { value: "CANCELLED_BY_GUEST", label: "Cancelled by Guest", color: "secondary" },
  { value: "CANCELLED_BY_HOST", label: "Cancelled by Host", color: "secondary" },
  { value: "CANCELLED_BY_ADMIN", label: "Cancelled by Admin", color: "destructive" },
  { value: "COMPLETED", label: "Completed", color: "success" },
] as const;

export const AMENITY_CATEGORIES = [
  "Essentials",
  "Features",
  "Kitchen",
  "Outdoor",
  "Safety",
  "Bathroom",
  "Entertainment",
] as const;

export const DEFAULT_CURRENCY = "EUR";

export const ITEMS_PER_PAGE = 12;

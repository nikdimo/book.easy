import type { Resolved } from "@/lib/i18n/t";

interface TranslationResolver {
  resolve(key: string, source: string): Resolved;
}

export function resolveListingStatus(
  translator: TranslationResolver,
  status: string,
): Resolved {
  switch (status) {
    case "DRAFT": return translator.resolve("statuses.listing.draft", "Draft");
    case "APPROVED": return translator.resolve("statuses.listing.approved", "Approved");
    case "UNPUBLISHED": return translator.resolve("statuses.listing.unpublished", "Unpublished");
    case "SUSPENDED": return translator.resolve("statuses.listing.suspended", "Suspended");
    case "ARCHIVED": return translator.resolve("statuses.listing.archived", "Archived");
    default: return { text: status.replaceAll("_", " "), translated: false };
  }
}

export function resolveBookingStatus(
  translator: TranslationResolver,
  status: string,
): Resolved {
  switch (status) {
    case "PENDING": return translator.resolve("statuses.booking.pending", "Awaiting host approval");
    case "CONFIRMED": return translator.resolve("statuses.booking.confirmed", "Confirmed");
    case "REJECTED": return translator.resolve("statuses.booking.rejected", "Rejected");
    case "EXPIRED": return translator.resolve("statuses.booking.expired", "Expired");
    case "CANCELLED_BY_GUEST": return translator.resolve("statuses.booking.cancelled_by_guest", "Cancelled by guest");
    case "CANCELLED_BY_HOST": return translator.resolve("statuses.booking.cancelled_by_host", "Cancelled by host");
    case "CANCELLED_BY_ADMIN": return translator.resolve("statuses.booking.cancelled_by_support", "Cancelled by support");
    case "COMPLETED": return translator.resolve("statuses.booking.completed", "Completed");
    default: return { text: status.replaceAll("_", " "), translated: false };
  }
}

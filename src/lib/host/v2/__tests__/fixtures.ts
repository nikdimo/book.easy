import type { CalendarPlatform } from "@/lib/host/v2/calendar-feed-platform";
import type {
  HostCalendarBlock,
  HostCalendarListing,
  HostCalendarPromotion,
} from "@/lib/host/v2/calendar-types";

export const TODAY = "2026-03-10";
/** Eighteen months on, matching the guest-facing horizon the workspace loads. */
export const HORIZON_END = "2027-09-10";

export function makeListing(
  overrides: Partial<HostCalendarListing> = {},
): HostCalendarListing {
  return {
    id: "listing-1",
    title: "Sea View Apartment",
    slug: "sea-view-apartment",
    status: "APPROVED",
    availabilityMode: "OPEN",
    photoUrl: null,
    photoAlt: null,
    // Enough photos and a publish history, so a fixture is publish-ready unless a
    // test deliberately takes something away.
    photoCount: 5,
    publishedAt: "2026-01-05T00:00:00.000Z",
    city: "Ohrid",
    pricing: {
      currency: "EUR",
      baseNightlyRate: 120,
      cleaningFee: 30,
      minNights: 2,
      maxNights: 365,
    },
    datePrices: [],
    blocks: [],
    availabilityWindows: [],
    promotions: [],
    nextReservation: null,
    ...overrides,
  };
}

export function manualBlock(
  startDate: string,
  endDate: string,
  id = `manual-${startDate}`,
): HostCalendarBlock {
  return {
    id,
    startDate,
    endDate,
    blockType: "MANUAL_BLOCK",
    reason: null,
    guestName: null,
    bookingStatus: null,
    feedName: null,
    feedPlatform: null,
  };
}

export function bookingBlock(
  startDate: string,
  endDate: string,
  guestName = "Ana",
): HostCalendarBlock {
  return {
    id: `booking-${startDate}`,
    startDate,
    endDate,
    blockType: "BOOKING_HOLD",
    reason: null,
    guestName,
    bookingStatus: "CONFIRMED",
    feedName: null,
    feedPlatform: null,
  };
}

export function externalBlock(
  startDate: string,
  endDate: string,
  feed: { name: string; platform: CalendarPlatform | null } = {
    name: "Airbnb",
    platform: "AIRBNB",
  },
): HostCalendarBlock {
  return {
    id: `external-${startDate}`,
    startDate,
    endDate,
    blockType: "EXTERNAL_SYNC",
    reason: null,
    guestName: null,
    bookingStatus: null,
    feedName: feed.name,
    feedPlatform: feed.platform,
  };
}

export function promotion(
  overrides: Partial<HostCalendarPromotion> = {},
): HostCalendarPromotion {
  return {
    id: "promotion-1",
    type: "PERCENT_DISCOUNT",
    discountPercent: 10,
    minimumNights: 1,
    freeCleaning: false,
    roundToWholeUnit: false,
    startDate: null,
    endDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

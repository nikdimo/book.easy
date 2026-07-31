import { addDays, format, startOfToday } from "date-fns";
import type {
  CalendarWorkspaceProps,
  WorkspaceBlock,
  WorkspaceDatePrice,
} from "@/components/host/calendar-workspace";

function ymd(offset: number) {
  return format(addDays(startOfToday(), offset), "yyyy-MM-dd");
}

const blocks: WorkspaceBlock[] = [
  {
    id: "block-booking-1",
    startDate: ymd(5),
    endDate: ymd(11),
    blockType: "BOOKING_HOLD",
    booking: {
      id: "bk-1",
      guest: { name: "Ana Petrova" },
      status: "CONFIRMED",
    },
  },
  {
    id: "block-manual-1",
    startDate: ymd(18),
    endDate: ymd(21),
    blockType: "MANUAL_BLOCK",
    reason: "Maintenance — boiler service",
  },
];

const datePrices: WorkspaceDatePrice[] = Array.from(
  { length: 6 },
  (_, index) => ({
    id: `price-peak-${index}`,
    date: ymd(24 + index),
    nightlyRate: 160,
  }),
);

export const labProps: CalendarWorkspaceProps = {
  locale: "en",
  lens: "availability",
  listingId: "lab-listing",
  listingTitle: "Cozy 2BR Garden Apartment in Nea Flogita",
  listingStatus: "APPROVED",
  currency: "EUR",
  baseNightlyRate: 95,
  cleaningFee: 50,
  minNights: 5,
  datePrices,
  blocks,
  promotions: [
    {
      id: "lab-promotion",
      type: "PERCENT_DISCOUNT",
      discountPercent: 15,
      minimumNights: 5,
      freeCleaning: true,
      roundUpToNearestFive: true,
      startDate: null,
      endDate: null,
      createdAt: ymd(0),
    },
  ],
};

export const labPropsEmpty: CalendarWorkspaceProps = {
  ...labProps,
  listingTitle: "Brand new listing with no history",
  datePrices: [],
  blocks: [],
  promotions: [],
};

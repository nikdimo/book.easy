import type { CalendarBlock, FixedStayPeriod, NightlyPricing } from "./periods";
import type { QuickSetupDraft } from "./quick-setup";

/**
 * Fixture data for the fixed stay periods mockup. Presentation reads from here and
 * nowhere else, so swapping in a real query later touches one file.
 */

/**
 * The lab's "today" — a Monday. Pinned, like the calendar lab's, so the summer
 * fixtures are always in the future and the past-date rules can be seen working rather
 * than tripping over the fixtures themselves.
 */
export const LAB_TODAY = "2026-06-01";

export const LISTING = {
  title: "Cozy 2BR Garden Apartment in Nea Flogita",
  city: "Nea Flogita",
  country: "Greece",
  currency: "EUR",
  maxGuests: 4,
  locale: "en",
};

/**
 * The listing's ordinary pricing — nightly rate, per-date overrides, cleaning fee and
 * live offers. Nothing in here is fixed-stay-specific, because nothing about pricing
 * is: a fixed stay is quoted by handing these exact values and two dates to the
 * product's own `computeStayQuote`.
 */
export const NIGHTLY_PRICING: NightlyPricing = {
  baseNightlyRate: 160,
  cleaningFee: 60,
  currency: "EUR",
  // A short peak run inside the 18–25 July week, so a derived total is visibly not
  // just nights × base rate.
  overrides: {
    "2026-07-18": 185,
    "2026-07-19": 185,
    "2026-07-20": 185,
    "2026-07-21": 185,
  },
  // An ordinary listing promotion, with an ordinary threshold. It reaches the
  // fortnight options and not the weeks — the host's own rule deciding, with no
  // fixed-stay exception anywhere.
  promotions: [
    {
      id: "promo-fortnight",
      type: "PERCENT_DISCOUNT",
      discountPercent: 10,
      minimumNights: 14,
      freeCleaning: false,
      roundToWholeUnit: true,
      startDate: null,
      endDate: null,
      createdAt: "2026-05-01T00:00:00.000Z",
    },
  ],
};

/**
 * A Saturday-changeover season, the shape a weekly let actually has.
 *
 * Every state a period can be in is represented, because every one of them is a
 * different sentence on screen and the two panels disagree about which of them a guest
 * may even see.
 */
export const FIXED_PERIODS: FixedStayPeriod[] = [
  {
    // Already gone by. The host still sees it; no guest ever does.
    id: "period-may-23-7",
    checkIn: "2026-05-23",
    checkOut: "2026-05-30",
    disabled: false,
  },
  {
    id: "period-jul-04-7",
    checkIn: "2026-07-04",
    checkOut: "2026-07-11",
    disabled: false,
  },
  {
    // Same check-in as the week above: two real options from one Saturday. The booking
    // below runs through the middle of it, so it is offered and unbookable at once.
    id: "period-jul-04-14",
    checkIn: "2026-07-04",
    checkOut: "2026-07-18",
    disabled: false,
  },
  {
    id: "period-jul-11-7",
    checkIn: "2026-07-11",
    checkOut: "2026-07-18",
    disabled: false,
  },
  {
    // Carries the peak-rate nights, so its total differs from its neighbours'.
    id: "period-jul-18-7",
    checkIn: "2026-07-18",
    checkOut: "2026-07-25",
    disabled: false,
  },
  {
    id: "period-jul-25-7",
    checkIn: "2026-07-25",
    checkOut: "2026-08-01",
    disabled: false,
  },
  {
    // Fourteen nights, so the listing's "14 nights or more" offer applies to it.
    id: "period-aug-01-14",
    checkIn: "2026-08-01",
    checkOut: "2026-08-15",
    disabled: false,
  },
  {
    // Three nights imported from Airbnb sit inside this week, so the whole option goes.
    id: "period-aug-15-7",
    checkIn: "2026-08-15",
    checkOut: "2026-08-22",
    disabled: false,
  },
  {
    // Switched off by the host. Visible to them, absent for guests.
    id: "period-aug-22-14",
    checkIn: "2026-08-22",
    checkOut: "2026-09-05",
    disabled: true,
  },
];

/**
 * The listing's blocked nights — the one negative-availability record.
 *
 * A booking and an imported calendar event, which between them produce three different
 * period states: the booked option itself, the fortnight it runs through, and a week
 * withdrawn by three nights that came from another channel entirely.
 */
export const CALENDAR_BLOCKS: CalendarBlock[] = [
  {
    id: "block-booking-jul-11",
    start: "2026-07-11",
    end: "2026-07-18",
    kind: "BOOKING",
    periodId: "period-jul-11-7",
    label: "Marta P.",
  },
  {
    id: "block-ical-aug",
    start: "2026-08-17",
    end: "2026-08-20",
    kind: "IMPORTED",
    label: "Airbnb",
  },
];

/** The other half of the host story: a host who has switched the mode on and has not
 *  added anything yet. */
export const FIXED_PERIODS_EMPTY: FixedStayPeriod[] = [];

/**
 * What Quick setup opens with.
 *
 * Prefilled rather than blank, because the point of the mockup is the preview: a
 * reviewer should reach the generated list in one press. Against `FIXED_PERIODS` it
 * produces a mixture of new stays and ones the listing already offers, which is the
 * case worth looking at.
 */
export const QUICK_SETUP_EXAMPLE: QuickSetupDraft = {
  seasonStart: "2026-07-04",
  seasonEnd: "2026-08-29",
  changeoverWeekday: 6,
  lengths: [7, 14],
};

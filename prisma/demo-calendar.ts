import { BlockType, BookingStatus, PromotionType } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/**
 * Two months of calendar activity, applied to listings that already exist.
 *
 * Kept out of `seed.ts` and callable on its own because the seed deletes every user and
 * listing before it builds anything. That is fine for an empty database and ruinous for
 * a working one — and a calendar demo is exactly what someone wants on a database they
 * have already filled with their own listings.
 *
 * Everything here is confined to `WINDOW_START`–`WINDOW_END`, and a re-run clears only
 * what falls inside those dates on the two listings named. Anything outside that window,
 * or on any other listing, is never touched.
 */

/** Inclusive first day the demo owns. */
const WINDOW_START = new Date("2026-08-01");
/** Exclusive last day. Ranges here are `[start, end)`, like every stored range. */
const WINDOW_END = new Date("2026-10-01");

/** Named so a re-run can find and replace exactly the feeds this created. */
const DEMO_FEEDS = {
  airbnb: {
    name: "Airbnb",
    url: "https://www.airbnb.com/calendar/ical/demo-linger.ics?s=demo",
  },
  booking: {
    name: "Booking.com",
    url: "https://admin.booking.com/hotel/hoteladmin/ical.html?t=demo",
  },
  vrbo: {
    name: "Vrbo",
    url: "https://www.vrbo.com/icalendar/demo-linger.ics",
  },
} as const;

/** The minimum stays the demo's always-active offers use, and their identity. */
const DEMO_MINIMUMS = [5, 20];

function day(value: string): Date {
  return new Date(value);
}

async function clearWindow(db: PrismaClient, listingId: string) {
  // Bookings are removed through their holds so nothing is orphaned: the hold carries
  // the booking id, and a booking with no dates left is not a booking.
  const holds = await db.availabilityBlock.findMany({
    where: {
      listingId,
      startDate: { lt: WINDOW_END },
      endDate: { gt: WINDOW_START },
      bookingId: { not: null },
    },
    select: { bookingId: true },
  });
  await db.availabilityBlock.deleteMany({
    where: {
      listingId,
      startDate: { lt: WINDOW_END },
      endDate: { gt: WINDOW_START },
    },
  });
  const bookingIds = holds
    .map((hold) => hold.bookingId)
    .filter((id): id is string => Boolean(id));
  if (bookingIds.length > 0) {
    await db.booking.deleteMany({ where: { id: { in: bookingIds } } });
  }
  await db.listingAvailabilityWindow.deleteMany({
    where: {
      listingId,
      startDate: { lt: WINDOW_END },
      endDate: { gt: WINDOW_START },
    },
  });
  await db.listingDatePrice.deleteMany({
    where: { listingId, date: { gte: WINDOW_START, lt: WINDOW_END } },
  });
  await db.listingCalendarFeed.deleteMany({
    where: {
      listingId,
      url: { in: Object.values(DEMO_FEEDS).map((entry) => entry.url) },
    },
  });
}

async function feed(
  db: PrismaClient,
  listingId: string,
  which: keyof typeof DEMO_FEEDS,
) {
  return db.listingCalendarFeed.create({
    data: {
      listingId,
      ...DEMO_FEEDS[which],
      lastStatus: "OK",
      lastSyncedAt: day("2026-08-01"),
      lastEventCount: 2,
      lastBlockedNights: 8,
    },
  });
}

async function booking(
  db: PrismaClient,
  listingId: string,
  guestId: string,
  checkIn: string,
  checkOut: string,
  nightlyRate: number,
) {
  const nights = Math.round(
    (day(checkOut).getTime() - day(checkIn).getTime()) / 86400000,
  );
  const created = await db.booking.create({
    data: {
      listingId,
      guestId,
      checkIn: day(checkIn),
      checkOut: day(checkOut),
      guestCount: 2,
      nightlyRate,
      cleaningFee: 40,
      totalPrice: nightlyRate * nights + 40,
      numberOfNights: nights,
      status: BookingStatus.CONFIRMED,
    },
  });
  await db.availabilityBlock.create({
    data: {
      listingId,
      startDate: day(checkIn),
      endDate: day(checkOut),
      blockType: BlockType.BOOKING_HOLD,
      bookingId: created.id,
    },
  });
}

export async function applyCalendarDemo(
  db: PrismaClient,
  {
    closedListingId,
    openListingId,
    guestIds,
  }: {
    /** Gets the closed-by-default treatment: an open window inside a closed stretch. */
    closedListingId: string;
    /** Stays open by default, which is the only mode a manual block exists in. */
    openListingId: string;
    guestIds: [string, string];
  },
) {
  const [guestA, guestB] = guestIds;

  /* ── The closed-by-default listing ─────────────────────────────────────── */

  await clearWindow(db, closedListingId);
  await db.listing.update({
    where: { id: closedListingId },
    data: { availabilityMode: "CLOSED" },
  });
  await db.listingAvailabilityWindow.create({
    data: {
      listingId: closedListingId,
      startDate: day("2026-08-07"),
      endDate: day("2026-09-28"),
    },
  });

  const airbnb = await feed(db, closedListingId, "airbnb");
  const bookingCom = await feed(db, closedListingId, "booking");

  await booking(db, closedListingId, guestA, "2026-08-10", "2026-08-15", 120);
  await booking(db, closedListingId, guestB, "2026-09-11", "2026-09-16", 120);

  await db.availabilityBlock.createMany({
    data: [
      {
        listingId: closedListingId,
        startDate: day("2026-08-17"),
        endDate: day("2026-08-21"),
        blockType: BlockType.EXTERNAL_SYNC,
        feedId: airbnb.id,
      },
      {
        listingId: closedListingId,
        startDate: day("2026-09-21"),
        endDate: day("2026-09-25"),
        blockType: BlockType.EXTERNAL_SYNC,
        feedId: airbnb.id,
      },
      {
        listingId: closedListingId,
        startDate: day("2026-09-04"),
        endDate: day("2026-09-08"),
        blockType: BlockType.EXTERNAL_SYNC,
        feedId: bookingCom.id,
      },
      // A manual block on a closed listing can only be a leftover from when it was
      // open — which is why the calendar still draws a padlock for it, and why this is
      // the only padlock this listing has.
      {
        listingId: closedListingId,
        startDate: day("2026-08-24"),
        endDate: day("2026-08-26"),
        blockType: BlockType.MANUAL_BLOCK,
        reason: "Deep clean",
      },
    ],
  });

  await db.listingDatePrice.createMany({
    data: [
      { listingId: closedListingId, date: day("2026-09-01"), nightlyRate: 150 },
      { listingId: closedListingId, date: day("2026-09-02"), nightlyRate: 150 },
    ],
  });

  /* ── The open-by-default listing ───────────────────────────────────────── */

  await clearWindow(db, openListingId);
  await db.listing.update({
    where: { id: openListingId },
    data: { availabilityMode: "OPEN" },
  });

  const vrbo = await feed(db, openListingId, "vrbo");

  await booking(db, openListingId, guestB, "2026-08-06", "2026-08-12", 150);
  await booking(db, openListingId, guestA, "2026-09-08", "2026-09-13", 150);

  await db.availabilityBlock.createMany({
    data: [
      {
        listingId: openListingId,
        startDate: day("2026-08-20"),
        endDate: day("2026-08-25"),
        blockType: BlockType.EXTERNAL_SYNC,
        feedId: vrbo.id,
      },
      // With a note, so the run carries a label.
      {
        listingId: openListingId,
        startDate: day("2026-08-28"),
        endDate: day("2026-08-31"),
        blockType: BlockType.MANUAL_BLOCK,
        reason: "Family staying",
      },
      // The same act with nothing written: padlock, and no label to read.
      {
        listingId: openListingId,
        startDate: day("2026-09-17"),
        endDate: day("2026-09-20"),
        blockType: BlockType.MANUAL_BLOCK,
      },
    ],
  });

  // A high-season run above the base rate, so the coral custom-price colour and the
  // "these nights cost between X and Y" warning both appear on a real selection.
  await db.listingDatePrice.createMany({
    data: [
      { listingId: openListingId, date: day("2026-08-13"), nightlyRate: 210 },
      { listingId: openListingId, date: day("2026-08-14"), nightlyRate: 210 },
      { listingId: openListingId, date: day("2026-08-15"), nightlyRate: 240 },
      { listingId: openListingId, date: day("2026-08-16"), nightlyRate: 240 },
      { listingId: openListingId, date: day("2026-08-17"), nightlyRate: 180 },
    ],
  });

  /* ── Offers, so the promotions screen has a ladder to show ─────────────── */

  /**
   * Only the offers this demo owns are cleared, never every offer on the listing.
   *
   * An always-active offer has no dates to confine it to the demo window, so it is
   * matched by the minimum stay it was created with — the same value the save path
   * refuses duplicates of, which is what makes it an identity here. Dated offers are
   * matched by falling inside the window like everything else.
   */
  await db.listingPromotion.deleteMany({
    where: {
      listingId: openListingId,
      OR: [
        { startDate: null, endDate: null, minimumNights: { in: DEMO_MINIMUMS } },
        { startDate: { lt: WINDOW_END }, endDate: { gt: WINDOW_START } },
      ],
    },
  });
  await db.listingPromotion.createMany({
    data: [
      {
        listingId: openListingId,
        type: PromotionType.PERCENT_DISCOUNT,
        discountPercent: 10,
        minimumNights: 5,
      },
      {
        listingId: openListingId,
        type: PromotionType.PERCENT_DISCOUNT,
        discountPercent: 20,
        minimumNights: 20,
        freeCleaning: true,
      },
      // Dated, so a September selection shows a dated row above the always-active ones.
      {
        listingId: openListingId,
        type: PromotionType.PERCENT_DISCOUNT,
        discountPercent: 15,
        minimumNights: 2,
        startDate: day("2026-09-21"),
        endDate: day("2026-10-01"),
      },
    ],
  });
}

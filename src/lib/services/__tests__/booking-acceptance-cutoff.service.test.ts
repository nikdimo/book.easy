import { afterEach, describe, expect, it } from "vitest";
import {
  confirmBooking,
  createBooking,
  rejectBooking,
} from "@/lib/services/booking.service";
import { bookingAcceptanceCutoff } from "@/lib/services/booking-response-window";
import { db } from "@/lib/db";
import { houseRulesSnapshot } from "@/lib/host/v2/listing-house-rules";
import { houseRulesVersion } from "@/lib/host/v2/house-rules-version.server";
import {
  MARKETPLACE_TIME_ZONE,
  todayYmd,
  ymdToDbDate,
  zonedTimeToInstant,
} from "@/lib/utils/date-only";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "./test-helpers";

/**
 * #16: a pending request dies when the stay starts.
 *
 * `confirmBooking` used to guard on two things only — still PENDING, and
 * `responseDueAt > now` — and `responseDueAt` was an unconditional `createdAt + 24h`.
 * A request made at 23:00 on the 10th for a stay beginning the 10th stayed acceptable
 * until 23:00 on the 11th, so a host could confirm a guest into a stay already a night
 * old. `cancelBooking` then refuses that guest's own cancellation because
 * `checkIn <= today`, which left them with no self-service exit they ever had.
 *
 * The product decision recorded here is *allow same-day booking, cut off at check-in*:
 * creation still accepts today's date, the deadline is clamped to the stay's own
 * arrival instant, and answering after that instant expires the request rather than
 * confirming it.
 *
 * Integration test against the real local Postgres, like its neighbours in this
 * directory. Run `npm run db:docker` first if the container isn't up.
 */
describe("acceptance cutoff", () => {
  let fixtures: TestFixtures | undefined;

  afterEach(async () => {
    if (fixtures) await cleanupTestFixtures(fixtures);
    fixtures = undefined;
  });

  async function setup(checkInTime: string | null = "15:00") {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures = {
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    };
    await db.listing.update({
      where: { id: listing.id },
      data: { checkInTime, checkOutTime: "11:00" },
    });
    return { host, listing, guest };
  }

  /** The calendar day the marketplace is currently on, as a `@db.Date` value. */
  const marketplaceToday = () => ymdToDbDate(todayYmd());

  const dayFromToday = (days: number) => {
    const date = marketplaceToday();
    date.setUTCDate(date.getUTCDate() + days);
    return date;
  };

  /**
   * The frozen snapshot a request carries only when the guest accepted the rules, so
   * the deadline can be measured against exactly what `confirmBooking` reads back.
   */
  async function acceptedHouseRules(listingId: string) {
    const listing = await db.listing.findUniqueOrThrow({
      where: { id: listingId },
    });
    return houseRulesSnapshot(listing);
  }

  /**
   * A stay whose arrival is certainly ahead of this run and certainly sooner than the
   * ordinary 24-hour window — so the clamp is exercised whatever time of day the suite
   * runs at, rather than only before 15:00.
   */
  function clampedStay(): { ymd: string; checkInTime: string } {
    const [hour] = new Intl.DateTimeFormat("en-GB", {
      timeZone: MARKETPLACE_TIME_ZONE,
      hour12: false,
      hour: "2-digit",
    })
      .format(new Date())
      .split(":")
      .map(Number);
    // Before 22:00 the marketplace's own late evening is still ahead of us; after it,
    // tomorrow's small hours are, and both are well inside 24 hours from now.
    return hour < 22
      ? { ymd: todayYmd(), checkInTime: "23:30" }
      : { ymd: ymdFromToday(1), checkInTime: "01:00" };
  }

  const ymdFromToday = (days: number) =>
    dayFromToday(days).toISOString().slice(0, 10);

  /**
   * The clamp, read off a snapshot the guest actually accepted — so the deadline is
   * proven to follow the *frozen* arrival time rather than the default or the listing's
   * current value.
   */
  it("clamps an imminent request's deadline to the stay's frozen arrival instant", async () => {
    const stay = clampedStay();
    const { listing, guest } = await setup(stay.checkInTime);
    const rules = await acceptedHouseRules(listing.id);
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: ymdToDbDate(stay.ymd),
      checkOut: ymdToDbDate(ymdFromToday(3)),
      guestCount: 1,
      houseRulesAcceptedAt: new Date(),
      expectedHouseRulesVersion: houseRulesVersion(rules),
    });

    expect(booking.houseRulesSnapshot).not.toBeNull();
    const arrival = zonedTimeToInstant(stay.ymd, stay.checkInTime);
    expect(booking.responseDueAt.getTime()).toBe(arrival.getTime());
    // And strictly shorter than the flat window it used to get.
    expect(booking.responseDueAt.getTime()).toBeLessThan(
      booking.createdAt.getTime() + 24 * 3_600_000,
    );
    // Measured against exactly what `confirmBooking` will read back off the row.
    expect(
      bookingAcceptanceCutoff({
        checkIn: booking.checkIn,
        houseRulesSnapshot: booking.houseRulesSnapshot,
      }).getTime(),
    ).toBe(arrival.getTime());

    // A host who moves arrival afterwards must not move this request's deadline.
    await db.listing.update({
      where: { id: listing.id },
      data: { checkInTime: "08:00" },
    });
    const reread = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(
      bookingAcceptanceCutoff({
        checkIn: reread.checkIn,
        houseRulesSnapshot: reread.houseRulesSnapshot,
      }).getTime(),
    ).toBe(arrival.getTime());
  });

  it("still gives the full window to a stay far enough away", async () => {
    const { listing, guest } = await setup("15:00");
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: dayFromToday(30),
      checkOut: dayFromToday(33),
      guestCount: 1,
    });
    // `createdAt` is the database's own clock and the deadline is measured from the
    // service's, so these agree to within the round trip rather than to the millisecond.
    const window = booking.responseDueAt.getTime() - booking.createdAt.getTime();
    expect(window).toBeGreaterThan(24 * 3_600_000 - 5_000);
    expect(window).toBeLessThanOrEqual(24 * 3_600_000);
  });

  /**
   * The stay whose arrival is already behind us. There is no window left to open, so
   * the request is refused at creation rather than created dead.
   */
  it("refuses a same-day request whose arrival time has already passed", async () => {
    // Midnight today is behind every run of this suite, whatever hour it starts at.
    const { listing, guest } = await setup("00:00");
    const rules = await acceptedHouseRules(listing.id);
    await expect(
      createBooking({
        listingId: listing.id,
        guestId: guest.id,
        checkIn: marketplaceToday(),
        checkOut: dayFromToday(2),
        guestCount: 1,
        houseRulesAcceptedAt: new Date(),
        expectedHouseRulesVersion: houseRulesVersion(rules),
      }),
    ).rejects.toThrow(/check-in for these dates has already passed/i);
    // Nothing was written: no dead request, and no hold on the dates.
    expect(await db.booking.count({ where: { listingId: listing.id } })).toBe(0);
  });

  /**
   * The audit's failure case, reproduced on a legacy row: a request created under the
   * old unclamped rule, whose stored deadline is still in the future even though the
   * stay began yesterday. Accepting it used to confirm a guest into a stay underway.
   */
  it("expires rather than confirms a request whose stay has already begun", async () => {
    const { host, listing, guest } = await setup("15:00");
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: dayFromToday(3),
      checkOut: dayFromToday(6),
      guestCount: 1,
    });
    // Rewind the stay under the request, leaving the unclamped deadline exactly as the
    // old rule wrote it. No migration rewrites these rows, so the guard has to catch
    // them from the cutoff alone.
    await db.booking.update({
      where: { id: booking.id },
      data: {
        checkIn: dayFromToday(-1),
        checkOut: dayFromToday(2),
        responseDueAt: new Date(Date.now() + 6 * 3_600_000),
      },
    });

    await expect(
      confirmBooking(booking.id, host.id, { decision: "NO_INSTRUCTIONS" }),
    ).rejects.toThrow(/expired before it could be confirmed/i);

    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("EXPIRED");
    expect(after.respondedAt).not.toBeNull();
    // The expiry branch releases the dates, exactly as the ordinary sweep does.
    const holds = await db.availabilityBlock.count({
      where: { bookingId: booking.id, blockType: "BOOKING_HOLD" },
    });
    expect(holds).toBe(0);
    const timeline = await db.bookingTimelineEvent.findMany({
      where: { bookingId: booking.id },
      select: { type: true },
    });
    expect(timeline.map((entry) => entry.type)).toContain("EXPIRED");
  });

  /** Declining is the same answer question, so it closes on the same instant. */
  it("expires rather than declines a request whose stay has already begun", async () => {
    const { host, listing, guest } = await setup("15:00");
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: dayFromToday(3),
      checkOut: dayFromToday(6),
      guestCount: 1,
    });
    await db.booking.update({
      where: { id: booking.id },
      data: {
        checkIn: dayFromToday(-1),
        checkOut: dayFromToday(2),
        responseDueAt: new Date(Date.now() + 6 * 3_600_000),
      },
    });

    await expect(
      rejectBooking(booking.id, host.id, "Those dates no longer work."),
    ).rejects.toThrow(/expired/i);
    const after = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.status).toBe("EXPIRED");
  });

  /** A request whose stay starts later today is still answerable before arrival. */
  it("still accepts a request answered before the stay's arrival instant", async () => {
    const { host, listing, guest } = await setup("15:00");
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: dayFromToday(5),
      checkOut: dayFromToday(8),
      guestCount: 1,
    });
    const confirmed = await confirmBooking(booking.id, host.id, {
      decision: "NO_INSTRUCTIONS",
    });
    expect(confirmed.status).toBe("CONFIRMED");
    // The cutoff is genuinely ahead of the answer, not merely unreached by accident.
    expect(
      bookingAcceptanceCutoff({
        checkIn: confirmed.checkIn,
        houseRulesSnapshot: confirmed.houseRulesSnapshot,
      }).getTime(),
    ).toBeGreaterThan(Date.now());
  });

  /** A booking with no frozen snapshot falls back to the marketplace default arrival. */
  it("uses the default arrival time for a booking that froze no house rules", async () => {
    const { listing, guest } = await setup(null);
    const booking = await createBooking({
      listingId: listing.id,
      guestId: guest.id,
      checkIn: dayFromToday(1),
      checkOut: dayFromToday(3),
      guestCount: 1,
    });
    expect(booking.houseRulesSnapshot).toBeNull();
    const expected = Math.min(
      booking.createdAt.getTime() + 24 * 3_600_000,
      zonedTimeToInstant(
        booking.checkIn.toISOString().slice(0, 10),
        "15:00",
      ).getTime(),
    );
    expect(booking.responseDueAt.getTime()).toBe(expected);
  });
});

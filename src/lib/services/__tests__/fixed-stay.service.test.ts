import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getGuestFixedStayPeriods,
  getHostFixedStayPeriods,
  isManageableFixedStayState,
  projectGuestFixedStayPeriods,
  projectHostFixedStayPeriods,
  resolveFixedStayPeriod,
  FIXED_STAY_STATE_PRIORITY,
  type FixedStayBlockRow,
  type FixedStayPeriodRow,
} from "@/lib/services/fixed-stay.service";
import { ymdToDbDate } from "@/lib/utils/date-only";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "@/lib/services/__tests__/test-helpers";

/**
 * The two projections, from both ends: the pure state rules on their own, then the same
 * rules over real rows in the local Postgres (see vitest.config.ts).
 */

const TODAY = "2029-06-02";

const period = (
  id: string,
  checkIn: string,
  checkOut: string,
  disabledAt: Date | null = null,
): FixedStayPeriodRow => ({ id, checkIn, checkOut, disabledAt });

const block = (
  start: string,
  end: string,
  kind: FixedStayBlockRow["kind"] = "MANUAL",
): FixedStayBlockRow => ({ start, end, kind });

const resolve = (
  row: FixedStayPeriodRow,
  overrides: {
    bookedPeriodIds?: string[];
    blocks?: FixedStayBlockRow[];
    today?: string;
  } = {},
) =>
  resolveFixedStayPeriod(row, {
    today: overrides.today ?? TODAY,
    bookedPeriodIds: new Set(overrides.bookedPeriodIds ?? []),
    blocks: overrides.blocks ?? [],
  });

describe("state priority", () => {
  it("is the approved order", () => {
    expect(FIXED_STAY_STATE_PRIORITY).toEqual([
      "PAST",
      "DISABLED",
      "BOOKED",
      "DATES_TAKEN",
      "AVAILABLE",
    ]);
  });

  it("calls a stay with no reason not to be bookable AVAILABLE", () => {
    expect(resolve(period("p", "2029-06-09", "2029-06-16")).state).toBe("AVAILABLE");
  });

  it("prefers PAST over every other answer", () => {
    // Switched off, booked, and blocked all at once — and still simply past.
    expect(
      resolve(period("p", "2029-05-26", "2029-06-02", new Date()), {
        bookedPeriodIds: ["p"],
        blocks: [block("2029-05-26", "2029-06-02", "BOOKING")],
      }).state,
    ).toBe("PAST");
  });

  it("prefers DISABLED over BOOKED and DATES_TAKEN", () => {
    const view = resolve(
      period("p", "2029-06-09", "2029-06-16", new Date()),
      {
        bookedPeriodIds: ["p"],
        blocks: [block("2029-06-09", "2029-06-16", "BOOKING")],
      },
    );
    expect(view.state).toBe("DISABLED");
    expect(view.manageable).toBe(false);
  });

  it("prefers BOOKED over DATES_TAKEN", () => {
    expect(
      resolve(period("p", "2029-06-09", "2029-06-16"), {
        bookedPeriodIds: ["p"],
        blocks: [block("2029-06-09", "2029-06-16", "BOOKING")],
      }).state,
    ).toBe("BOOKED");
  });

  it("calls a period DATES_TAKEN when something else holds its nights", () => {
    for (const kind of ["BOOKING", "MANUAL", "IMPORTED"] as const) {
      const view = resolve(period("p", "2029-06-09", "2029-06-16"), {
        blocks: [block("2029-06-10", "2029-06-12", kind)],
      });
      expect(view.state).toBe("DATES_TAKEN");
      expect(view.blockedBy).toEqual({
        kind,
        start: "2029-06-10",
        end: "2029-06-12",
      });
    }
  });

  it("treats check-in today as still on sale", () => {
    expect(resolve(period("p", TODAY, "2029-06-09")).state).toBe("AVAILABLE");
    expect(resolve(period("p", "2029-06-01", "2029-06-08")).state).toBe("PAST");
  });

  it("derives nights from the dates rather than storing them", () => {
    expect(resolve(period("a", "2029-06-09", "2029-06-16")).nights).toBe(7);
    expect(resolve(period("b", "2029-06-09", "2029-06-23")).nights).toBe(14);
  });
});

describe("half-open nights", () => {
  it("does not let a block starting on the checkout day take the stay", () => {
    // The stay runs [09, 16): the 16th is a departure, not an occupied night.
    expect(
      resolve(period("p", "2029-06-09", "2029-06-16"), {
        blocks: [block("2029-06-16", "2029-06-20")],
      }).state,
    ).toBe("AVAILABLE");
  });

  it("does not let a block ending on the check-in day take the stay", () => {
    expect(
      resolve(period("p", "2029-06-09", "2029-06-16"), {
        blocks: [block("2029-06-02", "2029-06-09")],
      }).state,
    ).toBe("AVAILABLE");
  });

  it("does take the stay when a single shared night overlaps", () => {
    expect(
      resolve(period("p", "2029-06-09", "2029-06-16"), {
        blocks: [block("2029-06-15", "2029-06-20")],
      }).state,
    ).toBe("DATES_TAKEN");
  });
});

describe("date-only behaviour across DST boundaries", () => {
  // Europe falls back on 2029-10-28. None of these answers may move with the clock.
  it("keeps a stay spanning the change at its stored length and state", () => {
    const view = resolve(period("p", "2029-10-27", "2029-11-03"), {
      today: "2029-10-01",
    });
    expect(view.nights).toBe(7);
    expect(view.state).toBe("AVAILABLE");
  });

  it("judges past-ness on the calendar date either side of the change", () => {
    expect(
      resolve(period("p", "2029-10-27", "2029-11-03"), { today: "2029-10-27" }).state,
    ).toBe("AVAILABLE");
    expect(
      resolve(period("p", "2029-10-27", "2029-11-03"), { today: "2029-10-28" }).state,
    ).toBe("PAST");
  });
});

describe("the host projection", () => {
  const periods = [
    period("later", "2029-06-16", "2029-06-23"),
    period("fortnight", "2029-06-09", "2029-06-23"),
    period("week", "2029-06-09", "2029-06-16"),
    period("past", "2029-05-05", "2029-05-12"),
  ];

  it("returns every period, sorted by check-in then checkout", () => {
    expect(
      projectHostFixedStayPeriods(periods, {
        today: TODAY,
        bookedPeriodIds: new Set(),
        blocks: [],
      }).map((view) => view.id),
    ).toEqual(["past", "week", "fortnight", "later"]);
  });

  it("locks booked and past stays and leaves the rest manageable", () => {
    const views = projectHostFixedStayPeriods(periods, {
      today: TODAY,
      bookedPeriodIds: new Set(["week"]),
      blocks: [block("2029-06-09", "2029-06-16", "BOOKING")],
    });
    const byId = Object.fromEntries(views.map((view) => [view.id, view]));
    expect(byId.past.manageable).toBe(false);
    expect(byId.week.state).toBe("BOOKED");
    expect(byId.week.manageable).toBe(false);
    // The fortnight overlaps the booked week, so its nights are taken — but nobody
    // bought *it*, and the host may still withdraw or move it.
    expect(byId.fortnight.state).toBe("DATES_TAKEN");
    expect(byId.fortnight.manageable).toBe(true);
  });

  it("agrees with isManageableFixedStayState on every state", () => {
    expect(isManageableFixedStayState("PAST")).toBe(false);
    expect(isManageableFixedStayState("BOOKED")).toBe(false);
    expect(isManageableFixedStayState("DISABLED")).toBe(true);
    expect(isManageableFixedStayState("DATES_TAKEN")).toBe(true);
    expect(isManageableFixedStayState("AVAILABLE")).toBe(true);
  });
});

describe("the guest projection", () => {
  const periods = [
    period("past", "2029-05-05", "2029-05-12"),
    period("off", "2029-06-09", "2029-06-16", new Date()),
    period("booked", "2029-06-16", "2029-06-23"),
    period("taken", "2029-06-23", "2029-06-30"),
    period("open", "2029-07-07", "2029-07-14"),
  ];
  const rows = projectGuestFixedStayPeriods(periods, {
    today: TODAY,
    bookedPeriodIds: new Set(["booked"]),
    blocks: [block("2029-06-24", "2029-06-26", "MANUAL")],
  });

  it("omits past and switched-off stays completely", () => {
    expect(rows.map((row) => row.id)).toEqual(["booked", "taken", "open"]);
  });

  it("keeps booked and taken stays visible but unselectable", () => {
    expect(rows.map((row) => [row.id, row.selectable])).toEqual([
      ["booked", false],
      ["taken", false],
      ["open", true],
    ]);
  });

  it("exposes nothing beyond the dates, the length and selectability", () => {
    expect(Object.keys(rows[0]).sort()).toEqual([
      "checkIn",
      "checkOut",
      "id",
      "nights",
      "selectable",
    ]);
  });

  it("carries no price of any kind", () => {
    const serialized = JSON.stringify(rows).toLowerCase();
    for (const word of ["price", "rate", "fee", "amount", "currency", "total"]) {
      expect(serialized).not.toContain(word);
    }
  });
});

// ─── Against the real database ──────────────────────────────────────────────────

describe("reading a listing's fixed stays", () => {
  const fixtures: TestFixtures[] = [];

  afterEach(async () => {
    while (fixtures.length > 0) {
      await cleanupTestFixtures(fixtures.pop()!);
    }
  });

  async function seed() {
    const { host, property, listing } = await createTestHostAndListing();
    const guest = await createTestGuest();
    fixtures.push({
      hostId: host.id,
      propertyId: property.id,
      listingId: listing.id,
      extraUserIds: [guest.id],
    });
    await db.listing.update({
      where: { id: listing.id },
      data: { bookingMode: "FIXED_STAYS" },
    });
    return { host, listing, guest };
  }

  const addPeriod = (listingId: string, checkIn: string, checkOut: string) =>
    db.listingFixedStayPeriod.create({
      data: {
        listingId,
        checkIn: ymdToDbDate(checkIn),
        checkOut: ymdToDbDate(checkOut),
      },
      select: { id: true },
    });

  it("shows the host every period, with derived state", async () => {
    const { host, listing } = await seed();
    const past = await addPeriod(listing.id, "2029-05-05", "2029-05-12");
    const open = await addPeriod(listing.id, "2029-06-09", "2029-06-16");

    const overview = await getHostFixedStayPeriods(
      { id: host.id, role: "HOST" },
      listing.id,
      TODAY,
    );
    expect(overview?.bookingMode).toBe("FIXED_STAYS");
    expect(overview?.periods.map((p) => [p.id, p.state, p.nights])).toEqual([
      [past.id, "PAST", 7],
      [open.id, "AVAILABLE", 7],
    ]);
  });

  it("marks the exact period an active booking was sold as BOOKED", async () => {
    const { host, listing, guest } = await seed();
    const week = await addPeriod(listing.id, "2029-06-09", "2029-06-16");
    await db.booking.create({
      data: {
        listingId: listing.id,
        guestId: guest.id,
        checkIn: ymdToDbDate("2029-06-09"),
        checkOut: ymdToDbDate("2029-06-16"),
        guestCount: 2,
        adults: 2,
        numberOfNights: 7,
        nightlyRate: 50,
        cleaningFee: 10,
        serviceFee: 0,
        totalPrice: 360,
        status: "PENDING",
        fixedStayPeriodId: week.id,
      },
    });

    const overview = await getHostFixedStayPeriods(
      { id: host.id, role: "HOST" },
      listing.id,
      TODAY,
    );
    expect(overview?.periods[0].state).toBe("BOOKED");
    expect(overview?.periods[0].manageable).toBe(false);
  });

  it("frees the period again once that booking is cancelled", async () => {
    const { host, listing, guest } = await seed();
    const week = await addPeriod(listing.id, "2029-06-09", "2029-06-16");
    const booking = await db.booking.create({
      data: {
        listingId: listing.id,
        guestId: guest.id,
        checkIn: ymdToDbDate("2029-06-09"),
        checkOut: ymdToDbDate("2029-06-16"),
        guestCount: 2,
        adults: 2,
        numberOfNights: 7,
        nightlyRate: 50,
        cleaningFee: 10,
        serviceFee: 0,
        totalPrice: 360,
        status: "CONFIRMED",
        fixedStayPeriodId: week.id,
      },
      select: { id: true },
    });
    await db.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED_BY_GUEST" },
    });

    const overview = await getHostFixedStayPeriods(
      { id: host.id, role: "HOST" },
      listing.id,
      TODAY,
    );
    expect(overview?.periods[0].state).toBe("AVAILABLE");
  });

  it("reads a manual block as DATES_TAKEN", async () => {
    const { host, listing } = await seed();
    await addPeriod(listing.id, "2029-06-09", "2029-06-16");
    await db.availabilityBlock.create({
      data: {
        listingId: listing.id,
        startDate: ymdToDbDate("2029-06-11"),
        endDate: ymdToDbDate("2029-06-13"),
        blockType: "MANUAL_BLOCK",
        reason: "Private note the guest must never see",
      },
    });

    const overview = await getHostFixedStayPeriods(
      { id: host.id, role: "HOST" },
      listing.id,
      TODAY,
    );
    expect(overview?.periods[0].state).toBe("DATES_TAKEN");
    expect(overview?.periods[0].blockedBy).toEqual({
      kind: "MANUAL",
      start: "2029-06-11",
      end: "2029-06-13",
    });
    expect(JSON.stringify(overview)).not.toContain("Private note");
  });

  it("refuses another host's listing and admits an admin", async () => {
    const { listing } = await seed();
    const other = await createTestHostAndListing();
    fixtures.push({
      hostId: other.host.id,
      propertyId: other.property.id,
      listingId: other.listing.id,
      extraUserIds: [],
    });

    expect(
      await getHostFixedStayPeriods(
        { id: other.host.id, role: "HOST" },
        listing.id,
        TODAY,
      ),
    ).toBeNull();
    expect(
      await getHostFixedStayPeriods(
        { id: other.host.id, role: "ADMIN" },
        listing.id,
        TODAY,
      ),
    ).not.toBeNull();
  });

  it("offers a guest nothing at all while the listing is FLEXIBLE", async () => {
    const { listing } = await seed();
    await addPeriod(listing.id, "2029-06-09", "2029-06-16");
    await db.listing.update({
      where: { id: listing.id },
      data: { bookingMode: "FLEXIBLE" },
    });

    const offer = await getGuestFixedStayPeriods(listing.id, TODAY);
    expect(offer).toEqual({ bookingMode: "FLEXIBLE", periods: [] });
  });

  it("hides past and disabled stays from a guest", async () => {
    const { listing } = await seed();
    await addPeriod(listing.id, "2029-05-05", "2029-05-12");
    const off = await addPeriod(listing.id, "2029-06-09", "2029-06-16");
    const open = await addPeriod(listing.id, "2029-06-16", "2029-06-23");
    await db.listingFixedStayPeriod.update({
      where: { id: off.id },
      data: { disabledAt: new Date() },
    });

    const offer = await getGuestFixedStayPeriods(listing.id, TODAY);
    expect(offer?.periods.map((row) => [row.id, row.selectable])).toEqual([
      [open.id, true],
    ]);
  });
});

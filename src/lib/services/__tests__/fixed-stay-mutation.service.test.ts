import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  addFixedStayPeriodForManagedListing,
  confirmFixedStayQuickSetupForManagedListing,
  deleteFixedStayPeriodForManagedListing,
  previewFixedStayQuickSetupForManagedListing,
  setBookingModeForManagedListing,
  setFixedStayPeriodDisabledForManagedListing,
  updateFixedStayPeriodForManagedListing,
  verifyFixedStayManager,
  type ManagedFixedStayListing,
} from "@/lib/services/fixed-stay-mutation.service";
import { dbDateToYmd, ymdToDbDate } from "@/lib/utils/date-only";
import type { FixedStayQuickSetup } from "@/lib/utils/fixed-stay-quick-setup";
import {
  cleanupTestFixtures,
  createTestGuest,
  createTestHostAndListing,
  type TestFixtures,
} from "@/lib/services/__tests__/test-helpers";

/**
 * Fixed-stay writes against the real local Postgres (see vitest.config.ts).
 *
 * Integration rather than mocked on purpose: the things most worth proving here are the
 * things a mock cannot have — the unique index refusing a duplicate, the advisory lock
 * serializing two runs, and a booking in another table locking a period.
 */

/** A Saturday, and the anchor every date below is measured from. */
const TODAY = "2029-06-02";
const SAT_1 = "2029-06-09";
const SAT_2 = "2029-06-16";
const SAT_3 = "2029-06-23";
const SAT_4 = "2029-06-30";

const fixtures: TestFixtures[] = [];
const auditedUserIds: string[] = [];

afterEach(async () => {
  // Audit rows hold a required FK to the user, so they go before the user does.
  if (auditedUserIds.length > 0) {
    await db.auditLog.deleteMany({ where: { userId: { in: auditedUserIds } } });
    auditedUserIds.length = 0;
  }
  while (fixtures.length > 0) {
    await cleanupTestFixtures(fixtures.pop()!);
  }
});

async function seedListing(
  bookingMode: "FLEXIBLE" | "FIXED_STAYS" = "FIXED_STAYS",
): Promise<{
  hostId: string;
  guestId: string;
  managed: ManagedFixedStayListing;
}> {
  const { host, property, listing } = await createTestHostAndListing();
  const guest = await createTestGuest();
  fixtures.push({
    hostId: host.id,
    propertyId: property.id,
    listingId: listing.id,
    extraUserIds: [guest.id],
  });
  auditedUserIds.push(host.id);

  await db.listing.update({ where: { id: listing.id }, data: { bookingMode } });
  return {
    hostId: host.id,
    guestId: guest.id,
    managed: {
      id: listing.id,
      slug: listing.slug,
      status: listing.status,
      bookingMode,
    },
  };
}

const addPeriodRow = (listingId: string, checkIn: string, checkOut: string) =>
  db.listingFixedStayPeriod.create({
    data: {
      listingId,
      checkIn: ymdToDbDate(checkIn),
      checkOut: ymdToDbDate(checkOut),
    },
    select: { id: true },
  });

async function periodDates(listingId: string) {
  const rows = await db.listingFixedStayPeriod.findMany({
    where: { listingId },
    orderBy: [{ checkIn: "asc" }, { checkOut: "asc" }],
    select: { checkIn: true, checkOut: true },
  });
  return rows.map(
    (row) => `${dbDateToYmd(row.checkIn)}>${dbDateToYmd(row.checkOut)}`,
  );
}

function bookingData(
  listingId: string,
  guestId: string,
  checkIn: string,
  checkOut: string,
  periodId: string,
  status: "PENDING" | "CONFIRMED" | "CANCELLED_BY_GUEST" | "REJECTED" | "EXPIRED",
) {
  return {
    listingId,
    guestId,
    checkIn: ymdToDbDate(checkIn),
    checkOut: ymdToDbDate(checkOut),
    guestCount: 2,
    adults: 2,
    numberOfNights: 7,
    nightlyRate: 50,
    cleaningFee: 10,
    serviceFee: 0,
    totalPrice: 360,
    status,
    fixedStayPeriodId: periodId,
  };
}

const season = (overrides: Partial<FixedStayQuickSetup> = {}): FixedStayQuickSetup => ({
  // The season opens on the first changeover Saturday, so it generates exactly the
  // three weeks between SAT_1 and SAT_4.
  seasonStart: SAT_1,
  lastCheckOut: SAT_4,
  changeoverWeekday: 6,
  nights: [7],
  ...overrides,
});

// ─── Authorization ──────────────────────────────────────────────────────────────

describe("who may manage a listing's fixed stays", () => {
  it("reaches a host's own listing and refuses another host's", async () => {
    const mine = await seedListing();
    const theirs = await seedListing();

    expect(
      await verifyFixedStayManager({ id: mine.hostId, role: "HOST" }, mine.managed.id),
    ).toMatchObject({ id: mine.managed.id, bookingMode: "FIXED_STAYS" });
    expect(
      await verifyFixedStayManager(
        { id: mine.hostId, role: "HOST" },
        theirs.managed.id,
      ),
    ).toBeNull();
  });

  it("lets an admin manage any listing", async () => {
    const theirs = await seedListing();
    const outsider = await createTestGuest();
    fixtures.push({
      hostId: outsider.id,
      propertyId: "none",
      listingId: null,
      extraUserIds: [],
    });

    expect(
      await verifyFixedStayManager(
        { id: outsider.id, role: "ADMIN" },
        theirs.managed.id,
      ),
    ).not.toBeNull();
  });

  it("refuses a period id belonging to another host's listing", async () => {
    const mine = await seedListing();
    const theirs = await seedListing();
    const theirPeriod = await addPeriodRow(theirs.managed.id, SAT_1, SAT_2);

    // The caller proved they manage *their* listing; the period is in someone else's.
    const result = await deleteFixedStayPeriodForManagedListing(
      mine.managed,
      mine.hostId,
      theirPeriod.id,
      TODAY,
    );
    expect(result).toEqual({ error: "Fixed stay not found." });
    expect(
      await db.listingFixedStayPeriod.count({ where: { id: theirPeriod.id } }),
    ).toBe(1);
  });

  it("refuses a period id from another listing the same host owns", async () => {
    const first = await seedListing();
    const second = await seedListing();
    const strayPeriod = await addPeriodRow(second.managed.id, SAT_1, SAT_2);

    expect(
      await updateFixedStayPeriodForManagedListing(
        first.managed,
        first.hostId,
        { periodId: strayPeriod.id, checkIn: SAT_2, nights: 7 },
        TODAY,
      ),
    ).toEqual({ error: "Fixed stay not found." });
    const untouched = await db.listingFixedStayPeriod.findUniqueOrThrow({
      where: { id: strayPeriod.id },
    });
    expect(dbDateToYmd(untouched.checkIn)).toBe(SAT_1);
  });
});

// ─── Booking mode ───────────────────────────────────────────────────────────────

describe("switching booking mode", () => {
  it("switches in both directions and changes only that column", async () => {
    const { hostId, managed } = await seedListing("FLEXIBLE");

    expect(
      await setBookingModeForManagedListing(managed, hostId, "FIXED_STAYS"),
    ).toEqual({ success: true, bookingMode: "FIXED_STAYS" });
    expect(
      (
        await db.listing.findUniqueOrThrow({
          where: { id: managed.id },
          select: { bookingMode: true },
        })
      ).bookingMode,
    ).toBe("FIXED_STAYS");

    expect(
      await setBookingModeForManagedListing(
        { ...managed, bookingMode: "FIXED_STAYS" },
        hostId,
        "FLEXIBLE",
      ),
    ).toEqual({ success: true, bookingMode: "FLEXIBLE" });
  });

  it("preserves windows, minimum stay, availability mode, prices, blocks and periods", async () => {
    const { hostId, managed } = await seedListing("FLEXIBLE");
    await db.listing.update({
      where: { id: managed.id },
      data: {
        availabilityMode: "CLOSED",
        availabilityWindows: {
          create: {
            startDate: ymdToDbDate("2029-06-01"),
            endDate: ymdToDbDate("2029-09-01"),
          },
        },
        availabilityBlocks: {
          create: {
            startDate: ymdToDbDate("2029-07-01"),
            endDate: ymdToDbDate("2029-07-05"),
            blockType: "MANUAL_BLOCK",
          },
        },
        datePrices: {
          create: { date: ymdToDbDate("2029-07-10"), nightlyRate: 123 },
        },
      },
    });
    await db.pricingRule.update({
      where: { listingId: managed.id },
      data: { minNights: 5 },
    });

    const before = await snapshotListing(managed.id);
    await setBookingModeForManagedListing(managed, hostId, "FIXED_STAYS");
    const period = await addPeriodRow(managed.id, SAT_1, SAT_2);
    await setBookingModeForManagedListing(
      { ...managed, bookingMode: "FIXED_STAYS" },
      hostId,
      "FLEXIBLE",
    );

    const after = await snapshotListing(managed.id);
    expect(after).toEqual(before);
    // The period survives the round trip, so switching back to fixed stays restores it.
    expect(
      await db.listingFixedStayPeriod.count({ where: { id: period.id } }),
    ).toBe(1);
  });

  it("permits switching to fixed stays with no periods at all", async () => {
    const { hostId, managed } = await seedListing("FLEXIBLE");
    expect(
      await setBookingModeForManagedListing(managed, hostId, "FIXED_STAYS"),
    ).toEqual({ success: true, bookingMode: "FIXED_STAYS" });
    expect(await periodDates(managed.id)).toEqual([]);
  });

  it("re-reads the current mode under the lock instead of trusting a stale listing", async () => {
    const { hostId, managed } = await seedListing("FLEXIBLE");
    await db.listing.update({
      where: { id: managed.id },
      data: { bookingMode: "FIXED_STAYS" },
    });

    // `managed` still says FLEXIBLE. The database says FIXED_STAYS, so this is a real
    // switch back and must not be mistaken for an idempotent no-op.
    expect(
      await setBookingModeForManagedListing(managed, hostId, "FLEXIBLE"),
    ).toEqual({ success: true, bookingMode: "FLEXIBLE" });
    expect(
      (
        await db.listing.findUniqueOrThrow({
          where: { id: managed.id },
          select: { bookingMode: true },
        })
      ).bookingMode,
    ).toBe("FLEXIBLE");
  });

  it("refuses a mode this product does not have", async () => {
    const { hostId, managed } = await seedListing("FLEXIBLE");
    expect(
      await setBookingModeForManagedListing(
        managed,
        hostId,
        "PACKAGES" as unknown as "FLEXIBLE",
      ),
    ).toEqual({ error: "Choose either flexible dates or fixed stays." });
  });
});

async function snapshotListing(listingId: string) {
  const listing = await db.listing.findUniqueOrThrow({
    where: { id: listingId },
    select: {
      availabilityMode: true,
      pricingRule: { select: { minNights: true, baseNightlyRate: true } },
      availabilityWindows: { select: { startDate: true, endDate: true } },
      availabilityBlocks: { select: { startDate: true, endDate: true, blockType: true } },
      datePrices: { select: { date: true, nightlyRate: true } },
    },
  });
  return JSON.parse(JSON.stringify(listing));
}

// ─── Adding, editing, switching off, deleting ───────────────────────────────────

describe("mutations while the listing is FLEXIBLE", () => {
  it("refuses every fixed-period write", async () => {
    const { hostId, managed } = await seedListing("FLEXIBLE");
    const strayPeriod = await addPeriodRow(managed.id, SAT_1, SAT_2);
    const refusal = { error: "Switch this listing to fixed stays before changing its stays." };

    expect(
      await addFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { checkIn: SAT_2, nights: 7 },
        TODAY,
      ),
    ).toEqual(refusal);
    expect(
      await updateFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { periodId: strayPeriod.id, checkIn: SAT_2, nights: 7 },
        TODAY,
      ),
    ).toEqual(refusal);
    expect(
      await setFixedStayPeriodDisabledForManagedListing(
        managed,
        hostId,
        { periodId: strayPeriod.id, disabled: true },
        TODAY,
      ),
    ).toEqual(refusal);
    expect(
      await deleteFixedStayPeriodForManagedListing(
        managed,
        hostId,
        strayPeriod.id,
        TODAY,
      ),
    ).toEqual(refusal);
    expect(
      await confirmFixedStayQuickSetupForManagedListing(managed, hostId, season()),
    ).toEqual(refusal);

    // Nothing moved.
    expect(await periodDates(managed.id)).toEqual([`${SAT_1}>${SAT_2}`]);
  });

  it("refuses even when the caller's stale copy claims fixed stays", async () => {
    const { hostId, managed } = await seedListing("FLEXIBLE");
    // The mode is re-read inside the transaction, so a lying snapshot changes nothing.
    expect(
      await addFixedStayPeriodForManagedListing(
        { ...managed, bookingMode: "FIXED_STAYS" },
        hostId,
        { checkIn: SAT_1, nights: 7 },
        TODAY,
      ),
    ).toEqual({
      error: "Switch this listing to fixed stays before changing its stays.",
    });
    expect(await periodDates(managed.id)).toEqual([]);
  });
});

describe("adding one stay", () => {
  it("stores an exact 7-night stay with a server-derived checkout", async () => {
    const { hostId, managed } = await seedListing();
    const result = await addFixedStayPeriodForManagedListing(
      managed,
      hostId,
      { checkIn: SAT_1, nights: 7 },
      TODAY,
    );
    expect(result).toMatchObject({
      success: true,
      period: { checkIn: SAT_1, checkOut: SAT_2, nights: 7 },
      overlaps: [],
    });
    expect(await periodDates(managed.id)).toEqual([`${SAT_1}>${SAT_2}`]);
  });

  it("stores an exact 14-night stay", async () => {
    const { hostId, managed } = await seedListing();
    await addFixedStayPeriodForManagedListing(
      managed,
      hostId,
      { checkIn: SAT_1, nights: 14 },
      TODAY,
    );
    expect(await periodDates(managed.id)).toEqual([`${SAT_1}>${SAT_3}`]);
  });

  it.each([1, 3, 6, 8, 10, 13, 15, 21, 0, -7, 7.5])(
    "refuses %s nights",
    async (nights) => {
      const { hostId, managed } = await seedListing();
      expect(
        await addFixedStayPeriodForManagedListing(
          managed,
          hostId,
          { checkIn: SAT_1, nights },
          TODAY,
        ),
      ).toEqual({ error: "A fixed stay must be exactly 7 or 14 nights." });
      expect(await periodDates(managed.id)).toEqual([]);
    },
  );

  it.each(["2029-06-31", "09/06/2029", "", "2029-6-9", "tomorrow"])(
    "refuses the malformed date %s",
    async (checkIn) => {
      const { hostId, managed } = await seedListing();
      expect(
        await addFixedStayPeriodForManagedListing(
          managed,
          hostId,
          { checkIn, nights: 7 },
          TODAY,
        ),
      ).toEqual({ error: "Enter a valid check-in date." });
    },
  );

  it("refuses a check-in that has already passed but allows today", async () => {
    const { hostId, managed } = await seedListing();
    expect(
      await addFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { checkIn: "2029-06-01", nights: 7 },
        TODAY,
      ),
    ).toEqual({ error: "Choose a check-in date that has not already passed." });

    expect(
      await addFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { checkIn: TODAY, nights: 7 },
        TODAY,
      ),
    ).toMatchObject({ success: true });
  });

  it("refuses an exact duplicate", async () => {
    const { hostId, managed } = await seedListing();
    await addPeriodRow(managed.id, SAT_1, SAT_2);
    expect(
      await addFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { checkIn: SAT_1, nights: 7 },
        TODAY,
      ),
    ).toEqual({ error: "This listing already offers exactly these dates." });
    expect(await periodDates(managed.id)).toEqual([`${SAT_1}>${SAT_2}`]);
  });

  it("allows an overlapping alternative and reports it as a warning", async () => {
    const { hostId, managed } = await seedListing();
    const week = await addPeriodRow(managed.id, SAT_1, SAT_2);

    const result = await addFixedStayPeriodForManagedListing(
      managed,
      hostId,
      { checkIn: SAT_1, nights: 14 },
      TODAY,
    );
    expect(result).toMatchObject({
      success: true,
      overlaps: [{ id: week.id, checkIn: SAT_1, checkOut: SAT_2 }],
    });
    expect(await periodDates(managed.id)).toEqual([
      `${SAT_1}>${SAT_2}`,
      `${SAT_1}>${SAT_3}`,
    ]);
  });

  it("does not call a back-to-back week an overlap", async () => {
    const { hostId, managed } = await seedListing();
    await addPeriodRow(managed.id, SAT_1, SAT_2);
    expect(
      await addFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { checkIn: SAT_2, nights: 7 },
        TODAY,
      ),
    ).toMatchObject({ success: true, overlaps: [] });
  });

  it("accepts and returns nothing resembling a price", async () => {
    const { hostId, managed } = await seedListing();
    const result = await addFixedStayPeriodForManagedListing(
      managed,
      hostId,
      // A client trying to price a package: the extra keys are simply not read.
      {
        checkIn: SAT_1,
        nights: 7,
        packagePrice: 999,
        packagePriceCurrency: "EUR",
      } as unknown as { checkIn: string; nights: number },
      TODAY,
    );
    expect(JSON.stringify(result)).not.toContain("999");
    const stored = await db.listingFixedStayPeriod.findFirstOrThrow({
      where: { listingId: managed.id },
    });
    expect(Object.keys(stored).sort()).toEqual([
      "checkIn",
      "checkOut",
      "createdAt",
      "disabledAt",
      "id",
      "listingId",
      "updatedAt",
    ]);
  });
});

describe("editing one stay", () => {
  it("derives the new checkout from the new check-in and length", async () => {
    const { hostId, managed } = await seedListing();
    const week = await addPeriodRow(managed.id, SAT_1, SAT_2);

    expect(
      await updateFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { periodId: week.id, checkIn: SAT_2, nights: 14 },
        TODAY,
      ),
    ).toMatchObject({
      success: true,
      period: { id: week.id, checkIn: SAT_2, checkOut: "2029-06-30", nights: 14 },
    });
    expect(await periodDates(managed.id)).toEqual([`${SAT_2}>${SAT_4}`]);
  });

  it("ignores a checkout the client tries to send", async () => {
    const { hostId, managed } = await seedListing();
    const week = await addPeriodRow(managed.id, SAT_1, SAT_2);

    await updateFixedStayPeriodForManagedListing(
      managed,
      hostId,
      {
        periodId: week.id,
        checkIn: SAT_1,
        nights: 7,
        checkOut: "2029-12-25",
      } as unknown as { periodId: string; checkIn: string; nights: number },
      TODAY,
    );
    expect(await periodDates(managed.id)).toEqual([`${SAT_1}>${SAT_2}`]);
  });

  it("refuses an edit onto another period's exact dates", async () => {
    const { hostId, managed } = await seedListing();
    const week = await addPeriodRow(managed.id, SAT_1, SAT_2);
    await addPeriodRow(managed.id, SAT_2, SAT_3);

    expect(
      await updateFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { periodId: week.id, checkIn: SAT_2, nights: 7 },
        TODAY,
      ),
    ).toEqual({ error: "This listing already offers exactly these dates." });
  });

  it("lets a period keep its own dates", async () => {
    const { hostId, managed } = await seedListing();
    const week = await addPeriodRow(managed.id, SAT_1, SAT_2);
    expect(
      await updateFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { periodId: week.id, checkIn: SAT_1, nights: 7 },
        TODAY,
      ),
    ).toMatchObject({ success: true, overlaps: [] });
  });

  it("refuses an invalid length or a past check-in", async () => {
    const { hostId, managed } = await seedListing();
    const week = await addPeriodRow(managed.id, SAT_1, SAT_2);

    expect(
      await updateFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { periodId: week.id, checkIn: SAT_2, nights: 10 },
        TODAY,
      ),
    ).toEqual({ error: "A fixed stay must be exactly 7 or 14 nights." });
    expect(
      await updateFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { periodId: week.id, checkIn: "2029-05-05", nights: 7 },
        TODAY,
      ),
    ).toEqual({ error: "Choose a check-in date that has not already passed." });
    expect(await periodDates(managed.id)).toEqual([`${SAT_1}>${SAT_2}`]);
  });
});

describe("switching one stay off and back on", () => {
  it("sets and clears disabledAt without deleting the row", async () => {
    const { hostId, managed } = await seedListing();
    const week = await addPeriodRow(managed.id, SAT_1, SAT_2);

    expect(
      await setFixedStayPeriodDisabledForManagedListing(
        managed,
        hostId,
        { periodId: week.id, disabled: true },
        TODAY,
      ),
    ).toMatchObject({ success: true, disabled: true });
    expect(
      (
        await db.listingFixedStayPeriod.findUniqueOrThrow({ where: { id: week.id } })
      ).disabledAt,
    ).not.toBeNull();

    await setFixedStayPeriodDisabledForManagedListing(
      managed,
      hostId,
      { periodId: week.id, disabled: false },
      TODAY,
    );
    expect(
      (
        await db.listingFixedStayPeriod.findUniqueOrThrow({ where: { id: week.id } })
      ).disabledAt,
    ).toBeNull();
  });

  it("lets a future switched-off period be edited and deleted", async () => {
    const { hostId, managed } = await seedListing();
    const week = await addPeriodRow(managed.id, SAT_1, SAT_2);
    await setFixedStayPeriodDisabledForManagedListing(
      managed,
      hostId,
      { periodId: week.id, disabled: true },
      TODAY,
    );

    expect(
      await updateFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { periodId: week.id, checkIn: SAT_2, nights: 7 },
        TODAY,
      ),
    ).toMatchObject({ success: true });
    expect(
      await deleteFixedStayPeriodForManagedListing(managed, hostId, week.id, TODAY),
    ).toMatchObject({ success: true, deletedId: week.id });
    expect(await periodDates(managed.id)).toEqual([]);
  });
});

describe("what locks a stay", () => {
  async function seedBooked(
    status: "PENDING" | "CONFIRMED" | "CANCELLED_BY_GUEST" | "REJECTED" | "EXPIRED",
  ) {
    const seeded = await seedListing();
    const week = await addPeriodRow(seeded.managed.id, SAT_1, SAT_2);
    await db.booking.create({
      data: bookingData(
        seeded.managed.id,
        seeded.guestId,
        SAT_1,
        SAT_2,
        week.id,
        status,
      ),
    });
    return { ...seeded, periodId: week.id };
  }

  it.each(["PENDING", "CONFIRMED"] as const)(
    "locks a period a %s booking was sold as",
    async (status) => {
      const { hostId, managed, periodId } = await seedBooked(status);
      const locked = { error: "A guest has booked this stay, so it cannot be changed." };

      expect(
        await updateFixedStayPeriodForManagedListing(
          managed,
          hostId,
          { periodId, checkIn: SAT_2, nights: 7 },
          TODAY,
        ),
      ).toEqual(locked);
      expect(
        await setFixedStayPeriodDisabledForManagedListing(
          managed,
          hostId,
          { periodId, disabled: true },
          TODAY,
        ),
      ).toEqual(locked);
      expect(
        await deleteFixedStayPeriodForManagedListing(managed, hostId, periodId, TODAY),
      ).toEqual(locked);
      expect(await periodDates(managed.id)).toEqual([`${SAT_1}>${SAT_2}`]);
    },
  );

  it.each(["CANCELLED_BY_GUEST", "REJECTED", "EXPIRED"] as const)(
    "does not let a %s booking lock the period for ever",
    async (status) => {
      const { hostId, managed, periodId } = await seedBooked(status);
      expect(
        await setFixedStayPeriodDisabledForManagedListing(
          managed,
          hostId,
          { periodId, disabled: true },
          TODAY,
        ),
      ).toMatchObject({ success: true });
      expect(
        await deleteFixedStayPeriodForManagedListing(managed, hostId, periodId, TODAY),
      ).toMatchObject({ success: true });
    },
  );

  it("locks a period whose check-in has already passed", async () => {
    const { hostId, managed } = await seedListing();
    const gone = await addPeriodRow(managed.id, "2029-05-05", "2029-05-12");
    const locked = { error: "This stay has already started, so it cannot be changed." };

    expect(
      await updateFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { periodId: gone.id, checkIn: SAT_1, nights: 7 },
        TODAY,
      ),
    ).toEqual(locked);
    expect(
      await setFixedStayPeriodDisabledForManagedListing(
        managed,
        hostId,
        { periodId: gone.id, disabled: true },
        TODAY,
      ),
    ).toEqual(locked);
    expect(
      await deleteFixedStayPeriodForManagedListing(managed, hostId, gone.id, TODAY),
    ).toEqual(locked);
  });

  it("leaves a DATES_TAKEN period fully manageable", async () => {
    const { hostId, managed, guestId } = await seedListing();
    const booked = await addPeriodRow(managed.id, SAT_1, SAT_2);
    const overlapping = await addPeriodRow(managed.id, SAT_1, SAT_3);
    await db.booking.create({
      data: bookingData(managed.id, guestId, SAT_1, SAT_2, booked.id, "CONFIRMED"),
    });
    await db.availabilityBlock.create({
      data: {
        listingId: managed.id,
        startDate: ymdToDbDate(SAT_1),
        endDate: ymdToDbDate(SAT_2),
        blockType: "BOOKING_HOLD",
      },
    });

    // The fortnight shares nights with the booked week, but nobody booked *it*.
    expect(
      await setFixedStayPeriodDisabledForManagedListing(
        managed,
        hostId,
        { periodId: overlapping.id, disabled: true },
        TODAY,
      ),
    ).toMatchObject({ success: true });
    expect(
      await deleteFixedStayPeriodForManagedListing(
        managed,
        hostId,
        overlapping.id,
        TODAY,
      ),
    ).toMatchObject({ success: true });
    // ...and the booked week is still there and still locked.
    expect(await periodDates(managed.id)).toEqual([`${SAT_1}>${SAT_2}`]);
  });
});

// ─── Quick setup ────────────────────────────────────────────────────────────────

describe("previewing Quick setup", () => {
  it("writes nothing", async () => {
    const { managed } = await seedListing();
    const before = await periodDates(managed.id);

    const preview = await previewFixedStayQuickSetupForManagedListing(
      managed,
      season(),
    );
    expect(preview).toMatchObject({ success: true, generated: 3, newCount: 3 });
    expect(await periodDates(managed.id)).toEqual(before);
    expect(await db.listingFixedStayPeriod.count({ where: { listingId: managed.id } }))
      .toBe(0);
  });

  it("marks the stays the listing already offers", async () => {
    const { managed } = await seedListing();
    await addPeriodRow(managed.id, SAT_1, SAT_2);

    const preview = await previewFixedStayQuickSetupForManagedListing(
      managed,
      season(),
    );
    expect(preview).toMatchObject({ generated: 3, newCount: 2, duplicateCount: 1 });
    if ("rows" in preview) {
      expect(
        preview.rows.map((row) => [`${row.checkIn}>${row.checkOut}`, row.duplicate]),
      ).toEqual([
        [`${SAT_1}>${SAT_2}`, true],
        [`${SAT_2}>${SAT_3}`, false],
        [`${SAT_3}>${SAT_4}`, false],
      ]);
    }
  });

  it("refuses a season it cannot generate from", async () => {
    const { managed } = await seedListing();
    expect(
      await previewFixedStayQuickSetupForManagedListing(
        managed,
        season({ lastCheckOut: "2029-05-01" }),
      ),
    ).toMatchObject({ issue: "SEASON_REVERSED" });
    expect(
      await previewFixedStayQuickSetupForManagedListing(
        managed,
        season({ changeoverWeekday: 9 as never }),
      ),
    ).toMatchObject({ issue: "INVALID_CHANGEOVER_WEEKDAY" });
  });
});

describe("confirming Quick setup", () => {
  it("regenerates the season on the server and reports its counts", async () => {
    const { hostId, managed } = await seedListing();
    expect(
      await confirmFixedStayQuickSetupForManagedListing(managed, hostId, season()),
    ).toEqual({ success: true, generated: 3, created: 3, skipped: 0 });
    expect(await periodDates(managed.id)).toEqual([
      `${SAT_1}>${SAT_2}`,
      `${SAT_2}>${SAT_3}`,
      `${SAT_3}>${SAT_4}`,
    ]);
  });

  it("creates both alternatives when both lengths are asked for", async () => {
    const { hostId, managed } = await seedListing();
    await confirmFixedStayQuickSetupForManagedListing(
      managed,
      hostId,
      season({ nights: [7, 14] }),
    );
    expect(await periodDates(managed.id)).toEqual([
      `${SAT_1}>${SAT_2}`,
      `${SAT_1}>${SAT_3}`,
      `${SAT_2}>${SAT_3}`,
      `${SAT_2}>${SAT_4}`,
      `${SAT_3}>${SAT_4}`,
    ]);
  });

  it("creates zero duplicates when the same setup is run again", async () => {
    const { hostId, managed } = await seedListing();
    await confirmFixedStayQuickSetupForManagedListing(managed, hostId, season());
    const second = await confirmFixedStayQuickSetupForManagedListing(
      managed,
      hostId,
      season(),
    );
    expect(second).toEqual({ success: true, generated: 3, created: 0, skipped: 3 });
    expect(await periodDates(managed.id)).toEqual([
      `${SAT_1}>${SAT_2}`,
      `${SAT_2}>${SAT_3}`,
      `${SAT_3}>${SAT_4}`,
    ]);
  });

  it("never edits, disables or deletes a period it finds already there", async () => {
    const { hostId, managed, guestId } = await seedListing();
    const booked = await addPeriodRow(managed.id, SAT_1, SAT_2);
    const off = await addPeriodRow(managed.id, SAT_2, SAT_3);
    await db.listingFixedStayPeriod.update({
      where: { id: off.id },
      data: { disabledAt: new Date("2029-01-01T00:00:00Z") },
    });
    await db.booking.create({
      data: bookingData(managed.id, guestId, SAT_1, SAT_2, booked.id, "CONFIRMED"),
    });

    const result = await confirmFixedStayQuickSetupForManagedListing(
      managed,
      hostId,
      season(),
    );
    expect(result).toEqual({ success: true, generated: 3, created: 1, skipped: 2 });

    const stillBooked = await db.listingFixedStayPeriod.findUniqueOrThrow({
      where: { id: booked.id },
    });
    expect(dbDateToYmd(stillBooked.checkIn)).toBe(SAT_1);
    expect(stillBooked.disabledAt).toBeNull();
    const stillOff = await db.listingFixedStayPeriod.findUniqueOrThrow({
      where: { id: off.id },
    });
    expect(stillOff.disabledAt).toEqual(new Date("2029-01-01T00:00:00Z"));
  });

  it("cannot create duplicates when two confirmations race", async () => {
    const { hostId, managed } = await seedListing();
    const [first, second] = await Promise.all([
      confirmFixedStayQuickSetupForManagedListing(managed, hostId, season()),
      confirmFixedStayQuickSetupForManagedListing(managed, hostId, season()),
    ]);

    const created =
      ("created" in first ? first.created : 0) +
      ("created" in second ? second.created : 0);
    expect(created).toBe(3);
    expect(await periodDates(managed.id)).toEqual([
      `${SAT_1}>${SAT_2}`,
      `${SAT_2}>${SAT_3}`,
      `${SAT_3}>${SAT_4}`,
    ]);
  });

  it("cannot create a duplicate when an add races a confirmation", async () => {
    const { hostId, managed } = await seedListing();
    await Promise.all([
      confirmFixedStayQuickSetupForManagedListing(managed, hostId, season()),
      addFixedStayPeriodForManagedListing(
        managed,
        hostId,
        { checkIn: SAT_1, nights: 7 },
        TODAY,
      ),
    ]);
    expect(await periodDates(managed.id)).toEqual([
      `${SAT_1}>${SAT_2}`,
      `${SAT_2}>${SAT_3}`,
      `${SAT_3}>${SAT_4}`,
    ]);
  });

  it("generates the same season across a daylight-saving change", async () => {
    const { hostId, managed } = await seedListing();
    // 2029-10-28 is the autumn clock change; every stay either side is still 7 nights.
    await confirmFixedStayQuickSetupForManagedListing(
      managed,
      hostId,
      season({ seasonStart: "2029-10-20", lastCheckOut: "2029-11-10" }),
    );
    expect(await periodDates(managed.id)).toEqual([
      "2029-10-20>2029-10-27",
      "2029-10-27>2029-11-03",
      "2029-11-03>2029-11-10",
    ]);
    const rows = await db.listingFixedStayPeriod.findMany({
      where: { listingId: managed.id },
      select: { checkIn: true, checkOut: true },
    });
    for (const row of rows) {
      expect(
        (row.checkOut.getTime() - row.checkIn.getTime()) / 86_400_000,
      ).toBe(7);
    }
  });

  it("refuses an unsupported duration before touching the database", async () => {
    const { hostId, managed } = await seedListing();
    expect(
      await confirmFixedStayQuickSetupForManagedListing(
        managed,
        hostId,
        season({ nights: [10 as never] }),
      ),
    ).toMatchObject({ issue: "UNSUPPORTED_LENGTH" });
    expect(await periodDates(managed.id)).toEqual([]);
  });
});

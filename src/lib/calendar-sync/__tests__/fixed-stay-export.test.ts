import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { buildListingCalendar } from "@/lib/calendar-sync/service";
import { parseIcs } from "@/lib/calendar-sync/ics";
import { addDaysToYmd, todayYmd, ymdToDbDate } from "@/lib/utils/date-only";
import {
  cleanupTestFixtures,
  createTestHostAndListing,
  type TestFixtures,
} from "@/lib/services/__tests__/test-helpers";

const HORIZON_DAYS = 730;
const fixtures: TestFixtures[] = [];
const day = (offset: number) => addDaysToYmd(todayYmd(), offset);

afterEach(async () => {
  while (fixtures.length > 0) await cleanupTestFixtures(fixtures.pop()!);
});

async function seed(options: {
  bookingMode?: "FLEXIBLE" | "FIXED_STAYS";
  availabilityMode?: "OPEN" | "CLOSED";
} = {}) {
  const { host, property, listing } = await createTestHostAndListing();
  fixtures.push({
    hostId: host.id,
    propertyId: property.id,
    listingId: listing.id,
    extraUserIds: [],
  });
  const token = `test-feed-${listing.id}`;
  await db.listing.update({
    where: { id: listing.id },
    data: {
      calendarFeedToken: token,
      bookingMode: options.bookingMode ?? "FIXED_STAYS",
      availabilityMode: options.availabilityMode ?? "OPEN",
    },
  });
  return { listingId: listing.id, token };
}

const addPeriod = (listingId: string, checkIn: string, checkOut: string) =>
  db.listingFixedStayPeriod.create({
    data: {
      listingId,
      checkIn: ymdToDbDate(checkIn),
      checkOut: ymdToDbDate(checkOut),
    },
  });

const addBlock = (
  listingId: string,
  startYmd: string,
  endYmd: string,
  blockType: "MANUAL_BLOCK" | "BOOKING_HOLD" = "MANUAL_BLOCK",
) =>
  db.availabilityBlock.create({
    data: {
      listingId,
      startDate: ymdToDbDate(startYmd),
      endDate: ymdToDbDate(endYmd),
      blockType,
    },
  });

const addWindow = (listingId: string, startYmd: string, endYmd: string) =>
  db.listingAvailabilityWindow.create({
    data: {
      listingId,
      startDate: ymdToDbDate(startYmd),
      endDate: ymdToDbDate(endYmd),
    },
  });

async function eventsFor(token: string) {
  const result = await buildListingCalendar(token);
  if (!result) throw new Error("no calendar");
  return { body: result.body, events: parseIcs(result.body) };
}

describe("weekly-stay calendar export", () => {
  it("exports only real blocks on an OPEN calendar", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, day(30), day(37));
    await addBlock(listingId, day(32), day(34), "BOOKING_HOLD");

    const { events } = await eventsFor(token);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      startYmd: day(32),
      endYmd: day(34),
      summary: "Reserved",
    });
    expect(events[0].uid).toMatch(/^block-/);
  });

  it("does not let legacy period rows change the export", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, day(30), day(37));
    expect((await eventsFor(token)).events).toEqual([]);
  });

  it("uses availability windows when the calendar is CLOSED", async () => {
    const { listingId, token } = await seed({ availabilityMode: "CLOSED" });
    await addWindow(listingId, day(30), day(60));
    await addPeriod(listingId, day(100), day(107));

    const derived = (await eventsFor(token)).events.filter((event) =>
      event.uid?.startsWith("closed-"),
    );
    expect(derived.map((event) => [event.startYmd, event.endYmd])).toEqual([
      [todayYmd(), day(30)],
      [day(60), day(HORIZON_DAYS)],
    ]);
  });

  it("closes the horizon when a CLOSED calendar has no windows", async () => {
    const { token } = await seed({ availabilityMode: "CLOSED" });
    const { events } = await eventsFor(token);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      startYmd: todayYmd(),
      endYmd: day(HORIZON_DAYS),
      summary: "Not available",
    });
  });

  it("exports identical availability rules in weekly and flexible modes", async () => {
    const weekly = await seed({ availabilityMode: "CLOSED" });
    const flexible = await seed({
      bookingMode: "FLEXIBLE",
      availabilityMode: "CLOSED",
    });
    for (const listingId of [weekly.listingId, flexible.listingId]) {
      await addWindow(listingId, day(20), day(50));
      await addBlock(listingId, day(25), day(27));
    }

    const normalize = (events: Awaited<ReturnType<typeof eventsFor>>["events"]) =>
      events.map(({ startYmd, endYmd, summary }) => ({ startYmd, endYmd, summary }));
    expect(normalize((await eventsFor(weekly.token)).events)).toEqual(
      normalize((await eventsFor(flexible.token)).events),
    );
  });

  it("produces valid iCalendar and stable derived UIDs", async () => {
    const { listingId, token } = await seed({ availabilityMode: "CLOSED" });
    await addWindow(listingId, day(30), day(60));
    const first = await eventsFor(token);
    const second = await eventsFor(token);
    expect(second.events.map((event) => event.uid)).toEqual(
      first.events.map((event) => event.uid),
    );
    expect(first.body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(first.body.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("returns null for an unknown token", async () => {
    expect(await buildListingCalendar("not-a-real-token")).toBeNull();
  });
});

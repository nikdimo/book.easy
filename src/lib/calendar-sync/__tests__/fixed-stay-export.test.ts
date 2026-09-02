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

/**
 * What a fixed-stay listing publishes to a connected channel, against the real local
 * Postgres (see vitest.config.ts).
 *
 * The export is a statement about *nights*, and the thing worth proving is which nights
 * it calls open: the union of the stays actually on sale, and nothing else in the two
 * years the feed covers. A flexible listing's document must come out byte for byte as it
 * did before, which is asserted here too rather than assumed.
 *
 * What none of this can prove — because no iCalendar document can say it — is the
 * arrival-day and stay-length rule itself. See the note on `buildListingCalendar`.
 */

/** The export's own horizon, so tests reason in the same two years it does. */
const HORIZON_DAYS = 730;

const fixtures: TestFixtures[] = [];

afterEach(async () => {
  while (fixtures.length > 0) {
    await cleanupTestFixtures(fixtures.pop()!);
  }
});

const day = (offset: number) => addDaysToYmd(todayYmd(), offset);

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

const addPeriod = (
  listingId: string,
  checkIn: string,
  checkOut: string,
  disabledAt: Date | null = null,
) =>
  db.listingFixedStayPeriod.create({
    data: {
      listingId,
      checkIn: ymdToDbDate(checkIn),
      checkOut: ymdToDbDate(checkOut),
      disabledAt,
    },
    select: { id: true },
  });

const addBlock = (
  listingId: string,
  startYmd: string,
  endYmd: string,
  blockType: "MANUAL_BLOCK" | "BOOKING_HOLD" | "EXTERNAL_SYNC" = "MANUAL_BLOCK",
) =>
  db.availabilityBlock.create({
    data: {
      listingId,
      startDate: ymdToDbDate(startYmd),
      endDate: ymdToDbDate(endYmd),
      blockType,
    },
    select: { id: true },
  });

const addWindow = (listingId: string, startYmd: string, endYmd: string) =>
  db.listingAvailabilityWindow.create({
    data: {
      listingId,
      startDate: ymdToDbDate(startYmd),
      endDate: ymdToDbDate(endYmd),
    },
    select: { id: true },
  });

/** The exported calendar, read back through the project's own parser. */
async function exportCalendar(token: string) {
  const result = await buildListingCalendar(token);
  if (!result) throw new Error("no calendar");
  const events = parseIcs(result.body);
  return { body: result.body, events };
}

/** Every night this feed leaves open — the complement of what it published as closed. */
async function openNights(token: string): Promise<Set<string>> {
  const { events } = await exportCalendar(token);
  const closed = new Set<string>();
  for (const event of events) {
    let night = event.startYmd;
    while (night < event.endYmd) {
      closed.add(night);
      night = addDaysToYmd(night, 1);
    }
  }
  const open = new Set<string>();
  let night = todayYmd();
  const end = day(HORIZON_DAYS);
  while (night < end) {
    if (!closed.has(night)) open.add(night);
    night = addDaysToYmd(night, 1);
  }
  return open;
}

const nightsBetween = (startYmd: string, endYmd: string) => {
  const nights: string[] = [];
  let night = startYmd;
  while (night < endYmd) {
    nights.push(night);
    night = addDaysToYmd(night, 1);
  }
  return nights;
};

// ─── Which nights a fixed-stay listing opens ────────────────────────────────────

describe("a fixed-stay listing's export", () => {
  it("opens exactly the nights of the stays on sale, and closes the rest", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, day(30), day(37));

    const open = await openNights(token);
    expect([...open].sort()).toEqual(nightsBetween(day(30), day(37)));
    // The gaps before and after are closed, which is the whole point of the document.
    expect(open.has(day(29))).toBe(false);
    expect(open.has(day(37))).toBe(false);
    expect(open.has(todayYmd())).toBe(false);
    expect(open.has(day(HORIZON_DAYS - 1))).toBe(false);
  });

  it("closes the gap between two stays", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, day(30), day(37));
    await addPeriod(listingId, day(60), day(74));

    const open = await openNights(token);
    expect([...open].sort()).toEqual([
      ...nightsBetween(day(30), day(37)),
      ...nightsBetween(day(60), day(74)),
    ]);
    for (const night of nightsBetween(day(37), day(60))) {
      expect(open.has(night), `${night} should be closed`).toBe(false);
    }
  });

  it("unions two overlapping stays rather than counting their shared nights twice", async () => {
    const { listingId, token } = await seed();
    // A week and the fortnight from the same day: overlapping alternatives.
    await addPeriod(listingId, day(30), day(37));
    await addPeriod(listingId, day(30), day(44));

    const open = await openNights(token);
    expect([...open].sort()).toEqual(nightsBetween(day(30), day(44)));

    // And the closed ranges around them coalesce into exactly two: before and after.
    const { events } = await exportCalendar(token);
    expect(events).toHaveLength(2);
    expect(events[0].startYmd).toBe(todayYmd());
    expect(events[0].endYmd).toBe(day(30));
    expect(events[1].startYmd).toBe(day(44));
    expect(events[1].endYmd).toBe(day(HORIZON_DAYS));
  });

  it("runs two back-to-back stays together into one open stretch", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, day(30), day(37));
    await addPeriod(listingId, day(37), day(44));

    const open = await openNights(token);
    expect([...open].sort()).toEqual(nightsBetween(day(30), day(44)));
    // No closed sliver at the changeover: the 37th is a checkout and a check-in, and
    // there is no night between them.
    const { events } = await exportCalendar(token);
    expect(events).toHaveLength(2);
  });

  it("opens nothing for a stay the host switched off", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, day(30), day(37), new Date());

    expect((await openNights(token)).size).toBe(0);
  });

  it("opens nothing for a stay whose check-in has gone by", async () => {
    const { listingId, token } = await seed();
    // Still running today, but not on sale: its check-in is behind us.
    await addPeriod(listingId, day(-3), day(4));

    const open = await openNights(token);
    expect(open.size).toBe(0);
    expect(open.has(day(1))).toBe(false);
  });

  it("opens a stay checking in today", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, todayYmd(), day(7));

    expect([...(await openNights(token))].sort()).toEqual(
      nightsBetween(todayYmd(), day(7)),
    );
  });

  it("closes the whole horizon when nothing is on sale", async () => {
    const { token } = await seed();

    const { events } = await exportCalendar(token);
    expect(events).toHaveLength(1);
    expect(events[0].startYmd).toBe(todayYmd());
    expect(events[0].endYmd).toBe(day(HORIZON_DAYS));
    expect(events[0].summary).toBe("Not available");
    expect((await openNights(token)).size).toBe(0);
  });

  it("clips a stay that runs past the horizon, and ignores one starting beyond it", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, day(HORIZON_DAYS - 3), day(HORIZON_DAYS + 11));
    await addPeriod(listingId, day(HORIZON_DAYS + 30), day(HORIZON_DAYS + 37));

    const open = await openNights(token);
    // Only the three nights inside the two years, and the document stops at the horizon.
    expect([...open].sort()).toEqual(
      nightsBetween(day(HORIZON_DAYS - 3), day(HORIZON_DAYS)),
    );
    const { events } = await exportCalendar(token);
    expect(events).toHaveLength(1);
    expect(events[0].endYmd).toBe(day(HORIZON_DAYS - 3));
  });
});

// ─── Blocks and modes ───────────────────────────────────────────────────────────

describe("a fixed-stay listing's blocks", () => {
  it("still exports a block sitting inside an offered stay", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, day(30), day(37));
    await addBlock(listingId, day(32), day(34), "BOOKING_HOLD");

    const { events } = await exportCalendar(token);
    const reserved = events.filter((event) => event.summary === "Reserved");
    expect(reserved).toHaveLength(1);
    expect(reserved[0].startYmd).toBe(day(32));
    expect(reserved[0].endYmd).toBe(day(34));
    expect(reserved[0].uid).toMatch(/^block-/);
  });

  it("exports manual and imported blocks unchanged too", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, day(30), day(44));
    await addBlock(listingId, day(31), day(32), "MANUAL_BLOCK");
    await addBlock(listingId, day(40), day(41), "EXTERNAL_SYNC");

    const { events } = await exportCalendar(token);
    const blockEvents = events.filter((event) => event.uid?.startsWith("block-"));
    expect(blockEvents).toHaveLength(2);
    expect(blockEvents.every((event) => event.summary === "Not available")).toBe(true);
  });
});

describe("availabilityMode is not consulted in fixed mode", () => {
  it("produces the same calendar whether the listing is OPEN or CLOSED", async () => {
    const openListing = await seed({ availabilityMode: "OPEN" });
    const closedListing = await seed({ availabilityMode: "CLOSED" });
    for (const seeded of [openListing, closedListing]) {
      await addPeriod(seeded.listingId, day(30), day(37));
    }

    const [fromOpen, fromClosed] = await Promise.all([
      exportCalendar(openListing.token),
      exportCalendar(closedListing.token),
    ]);
    // Same ranges and same summaries; only the listing id inside each UID differs.
    expect(
      fromOpen.events.map((event) => [event.startYmd, event.endYmd, event.summary]),
    ).toEqual(
      fromClosed.events.map((event) => [event.startYmd, event.endYmd, event.summary]),
    );
  });

  it("ignores availability windows entirely", async () => {
    const { listingId, token } = await seed({ availabilityMode: "CLOSED" });
    // A window opening a month the host offers no stay in. It must open nothing.
    await addWindow(listingId, day(100), day(130));
    await addPeriod(listingId, day(30), day(37));

    const open = await openNights(token);
    expect([...open].sort()).toEqual(nightsBetween(day(30), day(37)));
    expect(open.has(day(110))).toBe(false);
  });
});

// ─── Stability and format ───────────────────────────────────────────────────────

describe("the document itself", () => {
  it("gives derived ranges deterministic UIDs across polls", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, day(30), day(37));

    const first = await exportCalendar(token);
    const second = await exportCalendar(token);
    expect(second.events.map((event) => event.uid)).toEqual(
      first.events.map((event) => event.uid),
    );
    for (const event of first.events) {
      expect(event.uid).toBe(
        `closed-${event.startYmd}-${event.endYmd}-${listingId}@lingerhomes.com`,
      );
    }
  });

  it("is valid iCalendar with CRLF line endings", async () => {
    const { listingId, token } = await seed();
    await addPeriod(listingId, day(30), day(37));
    await addBlock(listingId, day(32), day(33), "BOOKING_HOLD");

    const { body } = await exportCalendar(token);
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(body.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    // Every line break is a CRLF: no bare LF anywhere in the document.
    expect(body.split("\n").length - 1).toBe(body.split("\r\n").length - 1);
    expect(body).toContain("DTSTART;VALUE=DATE:");
    expect(body).toContain("DTEND;VALUE=DATE:");
    // Dates and nothing else — the same promise the flexible feed makes.
    expect(body).not.toMatch(/ATTENDEE|ORGANIZER|DESCRIPTION|GEO|LOCATION/);
  });

  it("returns null for a token no listing holds", async () => {
    expect(await buildListingCalendar("not-a-real-token")).toBeNull();
  });
});

// ─── Flexible listings are untouched ────────────────────────────────────────────

describe("a flexible listing's export is unchanged", () => {
  it("OPEN publishes its blocks and nothing else", async () => {
    const { listingId, token } = await seed({
      bookingMode: "FLEXIBLE",
      availabilityMode: "OPEN",
    });
    await addBlock(listingId, day(10), day(13), "BOOKING_HOLD");
    await addBlock(listingId, day(20), day(21), "MANUAL_BLOCK");

    const { events } = await exportCalendar(token);
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.uid?.startsWith("block-"))).toBe(true);
    // No derived closed range anywhere: an OPEN calendar sells every night it has not
    // blocked, and always has.
    expect(events.some((event) => event.uid?.startsWith("closed-"))).toBe(false);
  });

  it("OPEN with no blocks at all publishes an empty calendar", async () => {
    const { token } = await seed({
      bookingMode: "FLEXIBLE",
      availabilityMode: "OPEN",
    });
    const { events } = await exportCalendar(token);
    expect(events).toEqual([]);
  });

  it("CLOSED publishes its blocks plus the complement of its windows", async () => {
    const { listingId, token } = await seed({
      bookingMode: "FLEXIBLE",
      availabilityMode: "CLOSED",
    });
    await addWindow(listingId, day(30), day(60));
    await addBlock(listingId, day(35), day(37), "BOOKING_HOLD");

    const { events } = await exportCalendar(token);
    const derived = events.filter((event) => event.uid?.startsWith("closed-"));
    expect(derived.map((event) => [event.startYmd, event.endYmd])).toEqual([
      [todayYmd(), day(30)],
      [day(60), day(HORIZON_DAYS)],
    ]);
    expect(events.filter((event) => event.uid?.startsWith("block-"))).toHaveLength(1);

    // The window's own nights stay open, minus the block inside it.
    const open = await openNights(token);
    expect(open.has(day(31))).toBe(true);
    expect(open.has(day(35))).toBe(false);
    expect(open.has(day(29))).toBe(false);
  });

  it("CLOSED still bridges two touching windows", async () => {
    const { listingId, token } = await seed({
      bookingMode: "FLEXIBLE",
      availabilityMode: "CLOSED",
    });
    await addWindow(listingId, day(30), day(45));
    await addWindow(listingId, day(45), day(60));

    const { events } = await exportCalendar(token);
    const derived = events.filter((event) => event.uid?.startsWith("closed-"));
    // One closed range before and one after — no sliver at the join.
    expect(derived.map((event) => [event.startYmd, event.endYmd])).toEqual([
      [todayYmd(), day(30)],
      [day(60), day(HORIZON_DAYS)],
    ]);
  });

  it("keeps its fixed-stay rows out of the calendar entirely", async () => {
    // A listing that sold whole stays and switched back still owns its stays. They must
    // open nothing and close nothing while it sells by the night.
    const { listingId, token } = await seed({
      bookingMode: "FLEXIBLE",
      availabilityMode: "OPEN",
    });
    await addPeriod(listingId, day(30), day(37));

    const { events } = await exportCalendar(token);
    expect(events).toEqual([]);
  });
});

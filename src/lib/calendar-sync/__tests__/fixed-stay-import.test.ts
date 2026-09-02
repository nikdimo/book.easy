import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * That importing a channel's calendar is blind to how this listing sells.
 *
 * Phase 6 changed only the export. Import mirrors whatever the remote calendar says into
 * `EXTERNAL_SYNC` blocks, and a fixed-stay listing must go through exactly the same path
 * a flexible one does — a channel telling us a night is taken is the same fact whichever
 * way we sell it, and a fixed-stay listing that quietly stopped importing would keep
 * offering a stay somebody else had already sold.
 */

vi.mock("@/lib/utils/public-url", () => ({
  // The real one resolves DNS and refuses private addresses. Neither is what this file
  // is about, and the fixture URL resolves to nothing.
  assertPublicHttpsUrl: async (url: string) => url,
}));

import { db } from "@/lib/db";
import { syncCalendarFeed } from "@/lib/calendar-sync/service";
import { addDaysToYmd, dbDateToYmd, todayYmd } from "@/lib/utils/date-only";
import {
  cleanupTestFixtures,
  createTestHostAndListing,
  type TestFixtures,
} from "@/lib/services/__tests__/test-helpers";

const fixtures: TestFixtures[] = [];
const originalFetch = globalThis.fetch;

const day = (offset: number) => addDaysToYmd(todayYmd(), offset);

/** The remote calendar, as a channel would serve it. */
function remoteCalendar(ranges: { start: string; end: string }[]): string {
  const events = ranges
    .map(
      ({ start, end }, index) =>
        [
          "BEGIN:VEVENT",
          `UID:remote-${index}@channel.example`,
          `DTSTART;VALUE=DATE:${start.replace(/-/g, "")}`,
          `DTEND;VALUE=DATE:${end.replace(/-/g, "")}`,
          "SUMMARY:Reserved",
          "END:VEVENT",
        ].join("\r\n"),
    )
    .join("\r\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", events, "END:VCALENDAR"].join("\r\n");
}

beforeEach(() => {
  globalThis.fetch = vi.fn(async () =>
    new Response(remoteCalendar([{ start: day(30), end: day(33) }]), {
      status: 200,
      headers: { "content-type": "text/calendar" },
    }),
  ) as unknown as typeof fetch;
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  while (fixtures.length > 0) {
    await cleanupTestFixtures(fixtures.pop()!);
  }
});

async function seedFeed(bookingMode: "FLEXIBLE" | "FIXED_STAYS") {
  const { host, property, listing } = await createTestHostAndListing();
  fixtures.push({
    hostId: host.id,
    propertyId: property.id,
    listingId: listing.id,
    extraUserIds: [],
  });
  await db.listing.update({ where: { id: listing.id }, data: { bookingMode } });
  const feed = await db.listingCalendarFeed.create({
    data: {
      listingId: listing.id,
      name: "Airbnb",
      url: `https://channel.example/${listing.id}.ics`,
    },
    select: { id: true },
  });
  return { listingId: listing.id, feedId: feed.id };
}

const importedBlocks = (listingId: string) =>
  db.availabilityBlock.findMany({
    where: { listingId, blockType: "EXTERNAL_SYNC" },
    select: { startDate: true, endDate: true, reason: true },
    orderBy: { startDate: "asc" },
  });

describe("importing a channel calendar", () => {
  it.each(["FLEXIBLE", "FIXED_STAYS"] as const)(
    "mirrors remote events into EXTERNAL_SYNC blocks on a %s listing",
    async (bookingMode) => {
      const { listingId, feedId } = await seedFeed(bookingMode);

      const result = await syncCalendarFeed(feedId);
      expect(result.ok).toBe(true);
      expect(result.events).toBe(1);
      expect(result.blockedNights).toBe(3);

      const blocks = await importedBlocks(listingId);
      expect(blocks).toHaveLength(1);
      expect(dbDateToYmd(blocks[0].startDate)).toBe(day(30));
      expect(dbDateToYmd(blocks[0].endDate)).toBe(day(33));
      expect(blocks[0].reason).toBe("Imported from a connected calendar");
    },
  );

  it("produces the same blocks in both modes for the same remote calendar", async () => {
    const flexible = await seedFeed("FLEXIBLE");
    const fixed = await seedFeed("FIXED_STAYS");

    await syncCalendarFeed(flexible.feedId);
    await syncCalendarFeed(fixed.feedId);

    const shape = (rows: Awaited<ReturnType<typeof importedBlocks>>) =>
      rows.map((row) => [dbDateToYmd(row.startDate), dbDateToYmd(row.endDate)]);
    expect(shape(await importedBlocks(fixed.listingId))).toEqual(
      shape(await importedBlocks(flexible.listingId)),
    );
  });

  it("does not consult the listing's fixed stays when deciding what to import", async () => {
    const { listingId, feedId } = await seedFeed("FIXED_STAYS");
    // A stay covering the very nights the channel says are taken. The import must mirror
    // the channel regardless — an offered stay is not a reason to ignore a sale
    // elsewhere, it is exactly the stay that has to stop being bookable.
    await db.listingFixedStayPeriod.create({
      data: {
        listingId,
        checkIn: new Date(`${day(30)}T00:00:00.000Z`),
        checkOut: new Date(`${day(37)}T00:00:00.000Z`),
      },
    });

    await syncCalendarFeed(feedId);
    const blocks = await importedBlocks(listingId);
    expect(blocks).toHaveLength(1);
    expect(dbDateToYmd(blocks[0].startDate)).toBe(day(30));
  });

  it("still replaces its own blocks in full on a re-sync", async () => {
    const { listingId, feedId } = await seedFeed("FIXED_STAYS");
    await syncCalendarFeed(feedId);

    // The upstream reservation was cancelled; the night must come back.
    globalThis.fetch = vi.fn(async () =>
      new Response(remoteCalendar([]), {
        status: 200,
        headers: { "content-type": "text/calendar" },
      }),
    ) as unknown as typeof fetch;

    const second = await syncCalendarFeed(feedId);
    expect(second.ok).toBe(true);
    expect(second.blockedNights).toBe(0);
    expect(await importedBlocks(listingId)).toEqual([]);
  });

  it("still leaves a host's own manual block alone", async () => {
    const { listingId, feedId } = await seedFeed("FIXED_STAYS");
    await db.availabilityBlock.create({
      data: {
        listingId,
        startDate: new Date(`${day(50)}T00:00:00.000Z`),
        endDate: new Date(`${day(52)}T00:00:00.000Z`),
        blockType: "MANUAL_BLOCK",
      },
    });

    await syncCalendarFeed(feedId);
    expect(
      await db.availabilityBlock.count({
        where: { listingId, blockType: "MANUAL_BLOCK" },
      }),
    ).toBe(1);
  });
});

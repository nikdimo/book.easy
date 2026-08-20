import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listingFindFirst: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { listing: { findFirst: mocks.listingFindFirst } },
}));

import { getListingAvailabilityOverview } from "@/lib/services/listing-availability-overview.service";

function listingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    title: "Sunny flat",
    status: "APPROVED",
    availabilityMode: "OPEN",
    availabilityBlocks: [],
    availabilityWindows: [],
    calendarFeeds: [],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.listingFindFirst.mockReset();
});

describe("getListingAvailabilityOverview", () => {
  it("reaches the listing through its host, so another host's listing is simply not found", async () => {
    mocks.listingFindFirst.mockResolvedValue(null);

    const overview = await getListingAvailabilityOverview("listing-1", "not-the-owner");

    expect(overview).toBeNull();
    const where = mocks.listingFindFirst.mock.calls[0][0].where;
    // Ownership is the query rather than a check afterwards: a listing that is not this
    // host's cannot enter the payload, and its existence is never revealed.
    expect(where).toEqual({ id: "listing-1", hostId: "not-the-owner" });
  });

  it("loads only dates that are still ahead, within the guest-facing horizon", async () => {
    mocks.listingFindFirst.mockResolvedValue(listingRow());

    await getListingAvailabilityOverview("listing-1", "host-1");

    const select = mocks.listingFindFirst.mock.calls[0][0].select;
    for (const relation of ["availabilityBlocks", "availabilityWindows"] as const) {
      const where = select[relation].where;
      // Anything still running today matters even if it started last week.
      expect(Object.keys(where.endDate)).toEqual(["gt"]);
      expect(Object.keys(where.startDate)).toEqual(["lt"]);
      expect(where.startDate.lt.getTime()).toBeGreaterThan(where.endDate.gt.getTime());
    }
  });

  it("never selects a booking's guest, because a block is a date and not a person", async () => {
    mocks.listingFindFirst.mockResolvedValue(listingRow());

    await getListingAvailabilityOverview("listing-1", "host-1");

    const blockSelect = mocks.listingFindFirst.mock.calls[0][0].select.availabilityBlocks
      .select;
    expect(blockSelect).not.toHaveProperty("booking");
    expect(blockSelect.feed.select).toEqual({ name: true, url: true });
  });

  it("summarizes the rows it loaded, resolving a feed's channel from its URL", async () => {
    mocks.listingFindFirst.mockResolvedValue(
      listingRow({
        availabilityMode: "CLOSED",
        availabilityWindows: [
          {
            id: "window-1",
            startDate: new Date(Date.UTC(2026, 5, 1)),
            endDate: new Date(Date.UTC(2026, 5, 8)),
          },
        ],
        availabilityBlocks: [
          {
            id: "block-1",
            startDate: new Date(Date.UTC(2026, 6, 1)),
            endDate: new Date(Date.UTC(2026, 6, 4)),
            blockType: "EXTERNAL_SYNC",
            reason: null,
            feed: {
              name: "Airbnb",
              url: "https://www.airbnb.com/calendar/ical/1.ics?s=secret",
            },
          },
          {
            id: "hold-1",
            startDate: new Date(Date.UTC(2026, 6, 10)),
            endDate: new Date(Date.UTC(2026, 6, 12)),
            blockType: "BOOKING_HOLD",
            reason: null,
            feed: null,
          },
        ],
        calendarFeeds: [
          {
            id: "feed-1",
            name: "Airbnb",
            url: "https://www.airbnb.com/calendar/ical/1.ics?s=secret",
            lastStatus: "OK",
            lastSyncedAt: new Date("2026-03-10T06:00:00.000Z"),
            lastBlockedNights: 12,
          },
        ],
      }),
    );

    const overview = await getListingAvailabilityOverview("listing-1", "host-1");

    expect(overview).not.toBeNull();
    expect(overview!.mode).toBe("CLOSED");
    expect(overview!.openWindowCount).toBe(1);
    expect(overview!.openWindows[0].lastDate).toBe("2026-06-07");
    // The reservation hold belongs to Reservations, not to blocked dates.
    expect(overview!.blockedPeriods.map((period) => period.id)).toEqual(["block-1"]);
    expect(overview!.blockedPeriods[0].feedPlatform).toBe("AIRBNB");
    expect(overview!.calendars[0].health).toBe("OK");
    expect(overview!.calendars[0].lastSyncedAt).toBe("2026-03-10T06:00:00.000Z");
    // The feed URL carries the token that reads the host's real calendar.
    expect(JSON.stringify(overview)).not.toContain("secret");
  });
});

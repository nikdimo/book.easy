import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_PREVIEW_LIMIT,
  calendarHrefForListing,
  summarizeListingAvailability,
  type AvailabilityOverviewInput,
} from "@/lib/host/v2/availability-overview";
import { platformFromFeedUrl } from "@/lib/host/v2/calendar-feed-platform";
import { addDaysToYmd } from "@/lib/utils/date-only";

const TODAY = "2026-03-10";

function input(
  overrides: Partial<AvailabilityOverviewInput> = {},
): AvailabilityOverviewInput {
  return {
    listingId: "listing-1",
    listingTitle: "Sunny flat",
    status: "APPROVED",
    mode: "OPEN",
    today: TODAY,
    horizonEnd: "2027-03-10",
    horizonMonths: 12,
    windows: [],
    blocks: [],
    feeds: [],
    resolvePlatform: platformFromFeedUrl,
    ...overrides,
  };
}

function block(overrides: Partial<AvailabilityOverviewInput["blocks"][number]>) {
  return {
    id: "block-1",
    startDate: "2026-03-20",
    endDate: "2026-03-23",
    blockType: "MANUAL_BLOCK",
    reason: null,
    feedName: null,
    feedUrl: null,
    ...overrides,
  };
}

describe("summarizeListingAvailability", () => {
  it("reports a stored range by the last night it actually covers", () => {
    const overview = summarizeListingAvailability(
      input({ blocks: [block({ startDate: "2026-03-20", endDate: "2026-03-23" })] }),
    );

    const [period] = overview.blockedPeriods;
    // Stored end is the exclusive checkout day; the host is shown the last blocked night.
    expect(period.lastDate).toBe("2026-03-22");
    expect(period.nights).toBe(3);
  });

  it("collapses a single night to one date", () => {
    const overview = summarizeListingAvailability(
      input({ blocks: [block({ startDate: "2026-04-01", endDate: "2026-04-02" })] }),
    );

    const [period] = overview.blockedPeriods;
    expect(period.startDate).toBe(period.lastDate);
    expect(period.nights).toBe(1);
  });

  it("leaves reservation holds to Reservations rather than calling them blocked dates", () => {
    const overview = summarizeListingAvailability(
      input({
        blocks: [
          block({ id: "manual", blockType: "MANUAL_BLOCK" }),
          block({ id: "hold", blockType: "BOOKING_HOLD" }),
          block({ id: "feed", blockType: "EXTERNAL_SYNC" }),
        ],
      }),
    );

    expect(overview.blockedPeriodCount).toBe(2);
    expect(overview.blockedPeriods.map((period) => period.id)).toEqual(["manual", "feed"]);
  });

  it("names the channel a mirrored block came from without carrying its URL", () => {
    const overview = summarizeListingAvailability(
      input({
        blocks: [
          block({
            blockType: "EXTERNAL_SYNC",
            feedName: "Airbnb",
            feedUrl: "https://www.airbnb.co.uk/calendar/ical/1.ics?s=secret",
          }),
        ],
      }),
    );

    const [period] = overview.blockedPeriods;
    expect(period.source).toBe("EXTERNAL");
    expect(period.feedPlatform).toBe("AIRBNB");
    expect(JSON.stringify(period)).not.toContain("secret");
  });

  it("orders periods by date and keeps the full count behind a short preview", () => {
    const starts = ["2026-06-01", "2026-04-01", "2026-05-01", "2026-03-15", "2026-07-01"];
    const overview = summarizeListingAvailability(
      input({
        blocks: starts.map((startDate, index) =>
          block({
            id: `block-${index}`,
            startDate,
            endDate: addDaysToYmd(startDate, 2),
          }),
        ),
      }),
    );

    expect(overview.blockedPeriodCount).toBe(5);
    expect(overview.blockedPeriods).toHaveLength(AVAILABILITY_PREVIEW_LIMIT);
    expect(overview.blockedPeriods.map((period) => period.startDate)).toEqual([
      "2026-03-15",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ]);
  });

  it("counts only periods that have not started as scheduled changes", () => {
    const overview = summarizeListingAvailability(
      input({
        mode: "CLOSED",
        // Running today, so already in effect rather than scheduled.
        windows: [{ id: "window-now", startDate: "2026-03-01", endDate: "2026-03-20" }],
        blocks: [
          block({ id: "later", startDate: "2026-05-01", endDate: "2026-05-04" }),
          block({ id: "running", startDate: "2026-03-05", endDate: "2026-03-12" }),
        ],
      }),
    );

    expect(overview.scheduledCount).toBe(1);
    expect(overview.openWindows[0].scheduled).toBe(false);
  });

  it("summarizes connected calendars and how many of them are failing", () => {
    const overview = summarizeListingAvailability(
      input({
        feeds: [
          {
            id: "feed-ok",
            name: "Airbnb",
            url: "https://www.airbnb.com/calendar/ical/1.ics",
            lastStatus: "OK",
            lastSyncedAt: "2026-03-10T06:00:00.000Z",
            lastBlockedNights: 12,
          },
          {
            id: "feed-bad",
            name: "Mum's cottage",
            url: "https://calendars.example.test/feed.ics",
            lastStatus: "ERROR",
            lastSyncedAt: null,
            lastBlockedNights: 0,
          },
          {
            id: "feed-new",
            name: "Booking",
            url: "https://admin.booking.com/ical/2.ics",
            lastStatus: "PENDING",
            lastSyncedAt: null,
            lastBlockedNights: 0,
          },
        ],
      }),
    );

    expect(overview.calendars.map((calendar) => calendar.health)).toEqual([
      "OK",
      "ERROR",
      "PENDING",
    ]);
    expect(overview.calendarsFailing).toBe(1);
    // A feed the host named themselves identifies nothing; only the URL does.
    expect(overview.calendars[1].platform).toBeNull();
    expect(overview.calendars[2].platform).toBe("BOOKING");
  });

  it("derives visibility from the listing's own status", () => {
    expect(summarizeListingAvailability(input()).visibility).toBe("LIVE");
    expect(summarizeListingAvailability(input({ status: "UNPUBLISHED" })).visibility).toBe(
      "HIDDEN",
    );
    expect(summarizeListingAvailability(input({ status: "DRAFT" })).visibility).toBe("DRAFT");
  });
});

describe("calendarHrefForListing", () => {
  it("points at Calendar, opened on this listing", () => {
    expect(calendarHrefForListing("listing-1")).toBe("/host/calendar?listing=listing-1");
  });

  it("encodes the id so it cannot escape the query parameter", () => {
    expect(calendarHrefForListing("a&b=c")).toBe("/host/calendar?listing=a%26b%3Dc");
  });
});

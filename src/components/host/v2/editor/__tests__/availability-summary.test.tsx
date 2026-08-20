import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvailabilitySummary } from "@/components/host/v2/editor/availability-summary";
import {
  summarizeListingAvailability,
  type AvailabilityOverviewInput,
  type ListingAvailabilityOverview,
} from "@/lib/host/v2/availability-overview";
import { platformFromFeedUrl } from "@/lib/host/v2/calendar-feed-platform";
import type { Translator } from "@/lib/i18n/t";

/** Untranslated English, which is what every locale falls back to before review. */
const t: Translator = {
  locale: "en",
  messages: {},
  resolve: (_key, source) => ({ text: source, translated: false }),
};

function overview(
  overrides: Partial<AvailabilityOverviewInput> = {},
): ListingAvailabilityOverview {
  return summarizeListingAvailability({
    listingId: "listing-1",
    listingTitle: "Sunny flat",
    status: "APPROVED",
    mode: "OPEN",
    today: "2026-03-10",
    horizonEnd: "2027-03-10",
    horizonMonths: 12,
    windows: [],
    blocks: [],
    feeds: [],
    resolvePlatform: platformFromFeedUrl,
    ...overrides,
  });
}

function render(data: ListingAvailabilityOverview): string {
  return renderToStaticMarkup(<AvailabilitySummary overview={data} t={t} />);
}

describe("AvailabilitySummary", () => {
  it("sends the host to Calendar for this listing and nowhere else", () => {
    const html = render(overview());

    expect(html).toContain('href="/host/v2/calendar?listing=listing-1"');
    expect(html).toContain("Manage availability in Calendar");
    // The one link on the page is the handoff.
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("offers nothing to edit", () => {
    const html = render(
      overview({
        mode: "CLOSED",
        windows: [{ id: "window-1", startDate: "2026-04-01", endDate: "2026-04-08" }],
        blocks: [
          {
            id: "block-1",
            startDate: "2026-05-01",
            endDate: "2026-05-04",
            blockType: "MANUAL_BLOCK",
            reason: "Renovation",
            feedName: null,
            feedUrl: null,
          },
        ],
      }),
    );

    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<textarea");
  });

  it("explains where availability is changed", () => {
    const html = render(overview());

    expect(html).toContain("Select dates in Calendar to open or block them.");
    expect(html).toContain("Listing-wide availability controls future dates.");
    expect(html).toContain(
      "External Airbnb, Booking.com and other calendars are connected and managed from Calendar.",
    );
  });

  it("states visibility and which way the calendar defaults", () => {
    const open = render(overview());
    expect(open).toContain("Open by default");
    expect(open).toContain(
      "Published to guests. Whether a stay can be booked also depends on its dates and pricing.",
    );

    const closed = render(overview({ mode: "CLOSED", status: "UNPUBLISHED" }));
    expect(closed).toContain("Closed by default");
    expect(closed).toContain("Only the dates you open can be booked.");
    expect(closed).toContain("Hidden from guests.");
  });

  it("lists open dates only for a listing that is closed by default", () => {
    const windows = [{ id: "window-1", startDate: "2026-04-01", endDate: "2026-04-08" }];

    expect(render(overview({ mode: "CLOSED", windows }))).toContain("Open dates");
    expect(render(overview({ mode: "OPEN", windows }))).not.toContain("Open dates");
  });

  it("shows a blocked range by its last blocked night, with what is holding it", () => {
    const html = render(
      overview({
        blocks: [
          {
            id: "block-1",
            startDate: "2026-05-01",
            endDate: "2026-05-04",
            blockType: "EXTERNAL_SYNC",
            reason: null,
            feedName: "Airbnb",
            feedUrl: "https://www.airbnb.com/calendar/ical/1.ics?s=secret",
          },
        ],
      }),
    );

    expect(html).toContain("May 1, 2026 – May 3, 2026");
    expect(html).toContain("3 nights");
    expect(html).toContain("Airbnb");
    expect(html).not.toContain("secret");
  });

  it("says plainly when nothing is blocked", () => {
    expect(render(overview())).toContain("Nothing is blocked.");
  });

  it("surfaces a connected calendar that has stopped syncing", () => {
    const html = render(
      overview({
        feeds: [
          {
            id: "feed-1",
            name: "Booking.com",
            url: "https://admin.booking.com/ical/2.ics",
            lastStatus: "ERROR",
            lastSyncedAt: "2026-03-01T06:00:00.000Z",
            lastBlockedNights: 4,
          },
        ],
      }),
    );

    expect(html).toContain("1 calendar");
    expect(html).toContain("1 is not syncing. Fix it in Calendar.");
    expect(html).toContain("Last sync failed");
  });

  it("counts scheduled changes that have not started yet", () => {
    const html = render(
      overview({
        blocks: [
          {
            id: "block-1",
            startDate: "2026-06-01",
            endDate: "2026-06-03",
            blockType: "MANUAL_BLOCK",
            reason: null,
            feedName: null,
            feedUrl: null,
          },
        ],
      }),
    );

    expect(html).toContain("1 upcoming range");
  });

  it("labels every group for a screen reader", () => {
    const html = render(overview());

    expect(html).toContain('aria-labelledby="availability-blocked"');
    expect(html).toContain('aria-labelledby="availability-how"');
  });
});

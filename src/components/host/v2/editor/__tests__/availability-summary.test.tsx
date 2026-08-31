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
  requestedLocale: "en",
  catalogReady: true,
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

/** Stands in for the client editor the page mounts; this file is about the report.
 *  `translate="no"` because this is scaffolding, not product copy the catalog should
 *  ever be asked to carry. */
const editorSlot = <div translate="no">Default availability form</div>;

function render(data: ListingAvailabilityOverview): string {
  return renderToStaticMarkup(
    <AvailabilitySummary overview={data} defaultsEditor={editorSlot} t={t} />,
  );
}

describe("AvailabilitySummary", () => {
  it("mounts the editable default above the report", () => {
    const html = render(overview());
    expect(html).toContain("Default availability form");
    // The lead says where each half of the job is done, and no longer claims the whole
    // of availability is set somewhere else.
    expect(html).toContain("Set how future dates start out here.");
    expect(html).not.toContain("Availability itself is set in Calendar");
  });

  it("hands off to the calendar by naming the job, not the screen", () => {
    const html = render(overview());

    // The intent travels with the link, so the calendar arrives asking which dates.
    expect(html).toContain(
      'href="/host/calendar?listing=listing-1&amp;intent=availability"',
    );
    expect(html).toContain("Open or block specific dates");
    // The old generic handoff is gone: it told a host where to go and nothing about why.
    expect(html).not.toContain("Manage availability in Calendar");
    expect(html).not.toContain("Open calendar");
  });

  it("does not restate the default it no longer owns as a read-only fact", () => {
    // The default has one home on this page — the form above — so the summary must not
    // print a second, non-editable copy of the same answer beside it.
    const html = render(overview({ mode: "CLOSED" }));
    expect(html).not.toContain("Availability mode");
    expect(html).not.toContain("Closed by default");
    expect(html).not.toContain("Open by default");
  });

  it("keeps listing visibility as its own separate fact", () => {
    // Visibility and default availability are different promises: a listing can be
    // visible and unbookable, and it can have bookable dates while nobody can find it.
    const open = render(overview());
    expect(open).toContain("Listing visibility");
    expect(open).toContain(
      "Published to guests. Whether a stay can be booked also depends on its dates and pricing.",
    );

    const hidden = render(overview({ status: "UNPUBLISHED" }));
    expect(hidden).toContain("Hidden from guests.");
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
    expect(html).toContain('aria-labelledby="availability-dates"');
    expect(html).toContain('aria-labelledby="availability-how"');
  });
});

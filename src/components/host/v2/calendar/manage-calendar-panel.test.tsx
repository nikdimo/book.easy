import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: mocks.push }),
}));
// The connected-calendars view is mounted in the same tree and imports server actions,
// which drag next-auth into a component test that never renders that view. Only the
// module boundary is stood in for; nothing about the panel's own behaviour is mocked.
vi.mock("@/lib/actions/calendar-sync.actions", () => ({
  addCalendarFeed: vi.fn(),
  getCalendarConnections: vi.fn(),
  refreshCalendarFeed: vi.fn(),
  regenerateCalendarExportToken: vi.fn(),
  removeCalendarFeed: vi.fn(),
}));
// Same reason, for the Booking method editor's own actions.
vi.mock("@/lib/actions/fixed-stay.actions", () => ({
  setListingBookingMode: vi.fn(),
  addFixedStayPeriod: vi.fn(),
  updateFixedStayPeriod: vi.fn(),
  setFixedStayPeriodEnabled: vi.fn(),
  deleteFixedStayPeriod: vi.fn(),
  previewFixedStayQuickSetup: vi.fn(),
  confirmFixedStayQuickSetup: vi.fn(),
}));
vi.mock("@/lib/actions/pricing.actions", () => ({
  saveListingPricing: vi.fn(),
}));

import { ManageCalendarPanel } from "@/components/host/v2/calendar/manage-calendar-panel";
import { buildCalendarFormats } from "@/lib/host/v2/calendar-format";
import {
  buildListingCalendarIndex,
  countDates,
} from "@/lib/host/v2/calendar-model";
import { summarizeListingStatus } from "@/lib/host/v2/listing-status";
import { MENU_VIEW, type WorkbenchView } from "@/lib/host/v2/calendar-workbench";
import type { CalendarSelection } from "@/lib/host/v2/calendar-selection";
import type { CalendarIntent } from "@/lib/host/v2/calendar-href";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import {
  HORIZON_END,
  makeListing,
  promotion,
  TODAY,
} from "@/lib/host/v2/__tests__/fixtures";

const formats = buildCalendarFormats("en", ["EUR"]);
const noop = () => {};

function render({
  listing = makeListing(),
  selection = null,
  view = MENU_VIEW,
  pendingIntent = null,
}: {
  listing?: HostCalendarListing;
  selection?: CalendarSelection | null;
  view?: WorkbenchView;
  pendingIntent?: CalendarIntent | null;
} = {}): string {
  const index = buildListingCalendarIndex(listing);
  const counts = countDates(listing, index, TODAY, HORIZON_END);
  return renderToStaticMarkup(
    <ManageCalendarPanel
      listing={listing}
      index={index}
      summary={summarizeListingStatus({ listing, counts, horizonMonths: 18 })}
      formats={formats}
      today={TODAY}
      horizonEnd={HORIZON_END}
      selection={selection}
      rangeLabel={selection ? "12 – 14 Mar" : ""}
      change={null}
      promotionEditorId={null}
      onChange={noop}
      onClearSelection={noop}
      onReviewDate={noop}
      actionPending={false}
      actionResult={null}
      onApplyAvailability={noop}
      onApplyPrice={noop}
      onApplyPromotion={noop}
      onUndoAction={noop}
      onDismissActionResult={noop}
      view={view}
      onOpenEditor={noop}
      onOpenSchedule={noop}
      onBack={noop}
      onOpenScheduledEntry={noop}
      onRemoveScheduledPromotion={noop}
      onSelectDatePromotion={noop}
      onOpenConnections={noop}
      pendingIntent={pendingIntent}
      onCancelIntent={noop}
    />,
  );
}

describe("no dates selected", () => {
  it("prompts for dates instead of offering listing-wide editors", () => {
    const html = render();

    expect(html).toContain(
      "Select dates on the calendar to open, block or price them.",
    );
    // The three destinations that used to sit here are gone from the panel entirely.
    expect(html).not.toContain("Default price and stay rules");
    expect(html).not.toContain("Listing visibility");
    expect(html).not.toContain("Base price, cleaning fee and minimum stay");
  });

  it("shows the listing's defaults as read-only context", () => {
    const html = render({ listing: makeListing({ availabilityMode: "CLOSED" }) });

    expect(html).toContain("Default availability");
    expect(html).toContain("Only dates you open");
    expect(html).toContain("Base price");
    expect(html).toContain("120");
  });

  it("links each default to the section that owns it", () => {
    const html = render();

    expect(html).toContain("Change default availability");
    expect(html).toContain('href="/host/listings/listing-1/availability"');
    expect(html).toContain("Change base price and ongoing offers");
    expect(html).toContain('href="/host/listings/listing-1/pricing"');
  });

  it("says so in words when the listing has no price, not in colour alone", () => {
    const html = render({ listing: makeListing({ pricing: null }) });
    expect(html).toContain("No pricing set");
  });

  it("keeps scheduled changes and connected calendars reachable", () => {
    const html = render();
    expect(html).toContain("Scheduled changes");
    expect(html).toContain("Connected calendars");
  });

  it("offers no save action at all", () => {
    // Nothing on this screen stages a change, so there is nothing for a primary
    // action to name and none is rendered.
    const html = render();
    expect(html).not.toContain("One change is saved at a time");
  });
});

describe("arriving with an intent", () => {
  it("asks for the dates that action needs, in that action's own words", () => {
    expect(render({ pendingIntent: "pricing" })).toContain(
      "Select the dates you want to give their own price.",
    );
    expect(render({ pendingIntent: "availability" })).toContain(
      "Select the dates you want to open or block.",
    );
    expect(render({ pendingIntent: "promotion" })).toContain(
      "Select the dates your offer should run on.",
    );
  });

  it("can be declined without selecting anything", () => {
    const html = render({ pendingIntent: "pricing" });
    expect(html).toContain("Choose the dates for this change");
    expect(html).toContain("Not now");
  });

  it("leaves the ordinary prompt alone when nothing was asked for", () => {
    const html = render();
    expect(html).not.toContain("Choose the dates for this change");
    expect(html).not.toContain("Not now");
  });
});

describe("dates selected", () => {
  const selection = { start: "2026-03-12", end: "2026-03-14" };

  it("still offers the three date editors", () => {
    const html = render({ selection });

    expect(html).toContain("Choose what to change");
    expect(html).toContain("Availability");
    expect(html).toContain("Nightly price");
    expect(html).toContain("Promotion");
  });

  it("drops the read-only defaults, which belong to the empty state", () => {
    const html = render({ selection });
    expect(html).not.toContain("Change base price and ongoing offers");
  });

  it("opens the selected-date price editor on those nights", () => {
    const html = render({
      selection,
      view: { kind: "editor", editor: "pricing" },
    });

    expect(html).toContain("Editing these dates");
    expect(html).toContain("12 – 14 Mar");
    // The listing-wide numbers it has to state are stated as a link out, not as
    // fields it could save.
    expect(html).toContain('href="/host/listings/listing-1/pricing"');
  });

  it("opens the selected-date availability editor on those nights", () => {
    const html = render({
      selection,
      view: { kind: "editor", editor: "availability" },
    });
    expect(html).toContain("Editing these dates");
  });

  it("opens the selected-date promotion editor on those nights", () => {
    const html = render({
      listing: makeListing({
        promotions: [promotion({ id: "p1", discountPercent: 10 })],
      }),
      selection,
      view: { kind: "editor", editor: "promotions" },
    });
    expect(html).toContain("Editing these dates");
  });
});

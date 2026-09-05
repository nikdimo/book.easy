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
  bookingBlock,
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
  companions = [],
  canChooseTargets = false,
  onChooseTargets = noop,
}: {
  listing?: HostCalendarListing;
  selection?: CalendarSelection | null;
  view?: WorkbenchView;
  pendingIntent?: CalendarIntent | null;
  /** Extra properties the availability act is aimed at, beside `listing`. */
  companions?: HostCalendarListing[];
  canChooseTargets?: boolean;
  onChooseTargets?: (() => void) | null;
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
      availabilityTargets={[
        { listing, index },
        ...companions.map((companion) => ({
          listing: companion,
          index: buildListingCalendarIndex(companion),
        })),
      ]}
      canChooseTargets={canChooseTargets}
      onChooseTargets={onChooseTargets}
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

/**
 * Blocking dates on more than one property.
 *
 * The panel's existing promise is that a press can never do less than its label says.
 * Aiming the same press at several properties is the easiest way to break that, because
 * the host can only see one property's calendar while they do it — so every test here
 * is about the panel saying out loud what the host cannot see.
 */
describe("blocking across properties", () => {
  const selection = { start: "2026-03-12", end: "2026-03-14" };
  const availability = { kind: "editor", editor: "availability" } as const;

  it("offers the way in only when there is somewhere else to go", () => {
    expect(
      render({ selection, view: availability, canChooseTargets: false }),
    ).not.toContain("Block on more properties");
    expect(
      render({ selection, view: availability, canChooseTargets: true }),
    ).toContain("Block on more properties");
  });

  it("counts every property's nights in the button that blocks them", () => {
    // Three nights on each of two properties. A label naming only the one on screen
    // would understate what the press is about to do.
    const html = render({
      selection,
      view: availability,
      canChooseTargets: true,
      companions: [makeListing({ id: "listing-2", title: "Villa Ohrid" })],
    });

    expect(html).toContain("Block 6 nights");
    expect(html).toContain("2 properties");
  });

  it("names the property holding nights it cannot move", () => {
    const html = render({
      selection,
      view: availability,
      canChooseTargets: true,
      companions: [
        makeListing({
          id: "listing-2",
          title: "Villa Ohrid",
          blocks: [bookingBlock("2026-03-12", "2026-03-15")],
        }),
      ],
    });

    // Three of the six nights are booked elsewhere, and the host is told where.
    expect(html).toContain("Block 3 nights");
    expect(html).toContain("Villa Ohrid");
    expect(html).toContain("will not change");
  });

  it("says nothing about other properties while only one is aimed at", () => {
    const html = render({
      selection,
      view: availability,
      canChooseTargets: true,
    });

    expect(html).toContain("Block 3 nights");
    // The single-property wording is untouched by the feature existing.
    expect(html).toContain("These 3 nights are open for booking.");
    expect(html).not.toContain("across");
  });

  it("stops being a button once the rail itself is the chooser", () => {
    // On desktop the checkboxes are in the property list, so a second control here
    // would be a dead target. It becomes a summary of the set instead.
    const html = render({
      selection,
      view: availability,
      canChooseTargets: true,
      onChooseTargets: null,
      companions: [makeListing({ id: "listing-2", title: "Villa Ohrid" })],
    });

    expect(html).toContain("Tick properties in the list on the left");
    expect(html).toContain("2 properties");
  });

  it("keeps the private note out of a set it does not describe", () => {
    // The stored note belongs to the property on screen. Shown beside a summary of
    // four properties it would read as all of theirs.
    const noted = makeListing({
      blocks: [
        {
          id: "m1",
          startDate: "2026-03-12",
          endDate: "2026-03-15",
          blockType: "MANUAL_BLOCK" as const,
          reason: "Repainting",
          guestName: null,
          bookingStatus: null,
          feedName: null,
          feedPlatform: null,
        },
      ],
    });

    expect(
      render({ listing: noted, selection, view: availability }),
    ).toContain("Repainting");
    expect(
      render({
        listing: noted,
        selection,
        view: availability,
        canChooseTargets: true,
        companions: [makeListing({ id: "listing-2" })],
      }),
    ).not.toContain("Repainting");
  });
});

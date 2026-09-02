import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Booking method editor, rendered statically.
 *
 * The repo's vitest environment is `node`, so nothing here is clicked — what this file
 * pins down is the branch: which controls a host is offered in each mode, that the
 * minimum stay exists in exactly one of them, that a booked or already-started stay
 * carries no action at all, and that no price of any kind reaches this surface.
 */

const mocks = vi.hoisted(() => ({
  useRouter: vi.fn(),
  setListingBookingMode: vi.fn(),
  saveListingPricing: vi.fn(),
  addFixedStayPeriod: vi.fn(),
  updateFixedStayPeriod: vi.fn(),
  setFixedStayPeriodEnabled: vi.fn(),
  deleteFixedStayPeriod: vi.fn(),
  previewFixedStayQuickSetup: vi.fn(),
  confirmFixedStayQuickSetup: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: mocks.useRouter }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/actions/fixed-stay.actions", () => ({
  setListingBookingMode: mocks.setListingBookingMode,
  addFixedStayPeriod: mocks.addFixedStayPeriod,
  updateFixedStayPeriod: mocks.updateFixedStayPeriod,
  setFixedStayPeriodEnabled: mocks.setFixedStayPeriodEnabled,
  deleteFixedStayPeriod: mocks.deleteFixedStayPeriod,
  previewFixedStayQuickSetup: mocks.previewFixedStayQuickSetup,
  confirmFixedStayQuickSetup: mocks.confirmFixedStayQuickSetup,
}));
vi.mock("@/lib/actions/pricing.actions", () => ({
  saveListingPricing: mocks.saveListingPricing,
}));

import { BookingMethodEditor } from "./booking-method-editor";
import { I18nProvider } from "@/lib/i18n/client";
import type { HostCalendarFixedStay } from "@/lib/host/v2/calendar-types";
import { makeListing, TODAY } from "@/lib/host/v2/__tests__/fixtures";

const stay = (
  id: string,
  checkIn: string,
  checkOut: string,
  state: HostCalendarFixedStay["state"] = "AVAILABLE",
): HostCalendarFixedStay => ({
  id,
  checkIn,
  checkOut,
  nights: 7,
  state,
  manageable: state !== "BOOKED" && state !== "PAST",
});

function render(overrides: Parameters<typeof makeListing>[0] = {}) {
  return renderToStaticMarkup(
    <BookingMethodEditor listing={makeListing(overrides)} today={TODAY} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useRouter.mockReturnValue({ refresh: vi.fn(), push: vi.fn() });
});

describe("the two ways to sell", () => {
  it("offers both as one radio group, with the stored one checked", () => {
    const html = render();
    expect(html).toContain('data-booking-method-choice="FLEXIBLE"');
    expect(html).toContain('data-booking-method-choice="FIXED_STAYS"');
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html.match(/name="host-v2-booking-method"/g)).toHaveLength(2);
    expect(html.match(/checked=""/g)).toHaveLength(1);
  });

  it("states what each one means to a guest", () => {
    const html = render();
    expect(html).toContain("Flexible dates");
    expect(html).toContain(
      "Guests choose their own check-in and checkout, within your minimum stay.",
    );
    expect(html).toContain("Fixed stays");
    expect(html).toContain(
      "Guests can only book the exact stays you add. Nothing else on the calendar is bookable.",
    );
  });

  it("promises that switching keeps everything", () => {
    expect(render()).toContain("Switching keeps everything you have set");
  });
});

describe("minimum stay has exactly one live home", () => {
  it("is editable here in flexible mode", () => {
    const html = render();
    expect(html).toContain("Minimum stay");
    // The stepper's own controls, which is what makes this the editing home.
    expect(html).toContain("Fewer nights");
    expect(html).toContain("More nights");
  });

  it("is absent in fixed mode, where the stays define the length", () => {
    const html = render({ bookingMode: "FIXED_STAYS" });
    expect(html).not.toContain("Minimum stay");
    expect(html).not.toContain("Fewer nights");
  });

  it("says what to do first when the listing has no price yet", () => {
    const html = render({ pricing: null });
    // The apostrophe arrives HTML-escaped, as every apostrophe in this markup does.
    expect(html).toContain(
      "Set this listing&#x27;s nightly price before choosing a minimum stay.",
    );
    expect(html).not.toContain("Fewer nights");
  });
});

describe("fixed mode", () => {
  it("formats generated dates in the catalog language, not an automatic translation target", () => {
    const html = renderToStaticMarkup(
      <I18nProvider
        locale="en"
        requestedLocale="mk"
        catalogReady={false}
        messages={{}}
      >
        <BookingMethodEditor
          listing={makeListing({ bookingMode: "FIXED_STAYS" })}
          today={TODAY}
        />
      </I18nProvider>,
    );
    expect(html).toContain(">Saturday</option>");
    expect(html).not.toContain("сабота");
  });

  it("warns about what calendar sync cannot enforce", () => {
    const html = render({ bookingMode: "FIXED_STAYS" });
    expect(html).toContain("data-fixed-stay-sync-warning");
    expect(html).toContain(
      "it cannot enforce Saturday arrivals or exact 7/14-night stays",
    );
    expect(html).toContain('role="note"');
  });

  it("shows no warning in flexible mode", () => {
    expect(render()).not.toContain("data-fixed-stay-sync-warning");
  });

  it("offers Quick setup and Add one", () => {
    const html = render({ bookingMode: "FIXED_STAYS" });
    expect(html).toContain("Quick setup");
    expect(html).toContain("Add one");
    expect(html).toContain("Season start");
    expect(html).toContain("Last checkout");
    expect(html).toContain("Changeover day");
    expect(html).toContain("7 nights");
    expect(html).toContain("14 nights");
    expect(html).toContain("Both");
    expect(html).toContain("Preview stays");
  });

  it("defaults the changeover day to Saturday", () => {
    const html = render({ bookingMode: "FIXED_STAYS" });
    expect(html).toContain('<option value="6" selected="">Saturday</option>');
  });

  it("says so when the host has added nothing yet", () => {
    const html = render({ bookingMode: "FIXED_STAYS" });
    expect(html).toContain("No stays yet");
    expect(html).toContain("nothing a guest can book");
  });

  it("never offers a checkout field — the server derives it", () => {
    const html = render({ bookingMode: "FIXED_STAYS" });
    expect(html).not.toContain("host-v2-manual-check-out");
    expect(html).not.toContain(">Checkout<");
  });
});

describe("the stays a host has added", () => {
  const listing = {
    bookingMode: "FIXED_STAYS" as const,
    fixedStayPeriods: [
      stay("open", "2026-04-04", "2026-04-11"),
      stay("off", "2026-04-11", "2026-04-18", "DISABLED"),
      stay("taken", "2026-04-18", "2026-04-25", "DATES_TAKEN"),
      stay("booked", "2026-04-25", "2026-05-02", "BOOKED"),
      stay("gone", "2026-03-01", "2026-03-08", "PAST"),
    ],
  };

  it("renders one row per stay, grouped by month", () => {
    const html = render(listing);
    for (const id of ["open", "off", "taken", "booked", "gone"]) {
      expect(html).toContain(`data-fixed-stay-row="${id}"`);
    }
    expect(html).toContain("March 2026");
    expect(html).toContain("April 2026");
  });

  it("names each state without naming a guest or a block reason", () => {
    const html = render(listing);
    expect(html).toContain("Offered");
    expect(html).toContain("Switched off");
    expect(html).toContain("Dates taken");
    expect(html).toContain("Booked");
    expect(html).toContain("Past");
    // No guest, no note, no channel: the row states what the *stay* is, and the reason
    // its nights are held belongs to the grid rather than to a settings panel.
    // ("Guests can only book…" above is the mode's own description, not a guest.)
    for (const leak of ["guest name", "Booked by", "Imported from", "Airbnb"]) {
      expect(html).not.toContain(leak);
    }
  });

  it("offers edit, turn off and remove on an available stay", () => {
    const html = render({
      ...listing,
      fixedStayPeriods: [stay("open", "2026-04-04", "2026-04-11")],
    });
    expect(html).toContain("Edit");
    expect(html).toContain("Turn off");
    expect(html).toContain("Remove");
  });

  it("offers turn on for a switched-off stay", () => {
    const html = render({
      ...listing,
      fixedStayPeriods: [stay("off", "2026-04-04", "2026-04-11", "DISABLED")],
    });
    expect(html).toContain("Turn on");
    expect(html).toContain("Edit");
    expect(html).toContain("Remove");
  });

  it("keeps a dates-taken stay fully manageable", () => {
    const html = render({
      ...listing,
      fixedStayPeriods: [stay("taken", "2026-04-04", "2026-04-11", "DATES_TAKEN")],
    });
    expect(html).toContain('data-manageable="true"');
    expect(html).toContain("Turn off");
    expect(html).toContain("Remove");
  });

  it.each(["BOOKED", "PAST"] as const)(
    "renders no action at all on a %s stay",
    (state) => {
      const html = render({
        ...listing,
        fixedStayPeriods: [stay("locked", "2026-04-04", "2026-04-11", state)],
      });
      expect(html).toContain('data-manageable="false"');
      // Not a disabled button — none at all. A control a host can see but never use is
      // a question the panel keeps asking them.
      expect(html).not.toContain(">Turn off<");
      expect(html).not.toContain(">Remove<");
      expect(html).not.toContain(">Edit<");
    },
  );

  it("counts what is offered and what guests cannot see", () => {
    const html = render(listing);
    // Open, taken and booked are offered; switched-off and past are not.
    expect(html).toContain("3 offered");
    expect(html).toContain("2 hidden from guests");
  });
});

describe("no price reaches this surface", () => {
  it("has no price field, and no package price of any kind", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      fixedStayPeriods: [stay("open", "2026-04-04", "2026-04-11")],
    });
    for (const word of [
      "packagePrice",
      "Package price",
      "package",
      "Nightly price",
      "Cleaning fee",
    ]) {
      expect(html).not.toContain(word);
    }
  });

  it("calls no mutation while merely rendering", () => {
    render({ bookingMode: "FIXED_STAYS" });
    expect(mocks.setListingBookingMode).not.toHaveBeenCalled();
    expect(mocks.addFixedStayPeriod).not.toHaveBeenCalled();
    expect(mocks.confirmFixedStayQuickSetup).not.toHaveBeenCalled();
    expect(mocks.previewFixedStayQuickSetup).not.toHaveBeenCalled();
    expect(mocks.saveListingPricing).not.toHaveBeenCalled();
  });
});

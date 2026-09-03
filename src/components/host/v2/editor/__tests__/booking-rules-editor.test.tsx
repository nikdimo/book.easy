import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useRouter: vi.fn(),
  setListingBookingMode: vi.fn(),
  setListingChangeoverWeekday: vi.fn(),
  setListingStayLimits: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: mocks.useRouter }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/actions/fixed-stay.actions", () => ({
  setListingBookingMode: mocks.setListingBookingMode,
  setListingChangeoverWeekday: mocks.setListingChangeoverWeekday,
  setListingStayLimits: mocks.setListingStayLimits,
}));

import { BookingRulesEditor } from "../booking-rules-editor";
import { makeListing, TODAY } from "@/lib/host/v2/__tests__/fixtures";
import type { HostCalendarListingContext } from "@/lib/host/v2/calendar-types";

/**
 * Booking rules on the Availability page: the one editable home for how a guest may
 * book.
 *
 * The section exists because "when and how may someone book" is not a price. What these
 * tests hold it to is that it is *complete* — style, both limits, and the changeover day
 * when it applies — and that it stays honest about weekly stays: the host sets a day and
 * two numbers, and the week lengths those permit are never presented as a set of
 * packages they chose.
 */
function context(
  overrides: Parameters<typeof makeListing>[0] = {},
): HostCalendarListingContext {
  return {
    listing: makeListing(overrides),
    formats: {} as HostCalendarListingContext["formats"],
    today: TODAY,
  } as HostCalendarListingContext;
}

/** The fixture's pricing rule with just the two stay limits moved. */
function limits(minNights: number, maxNights: number) {
  return { ...makeListing().pricing!, minNights, maxNights };
}

/** What the host actually reads, with markup and SVG path data stripped out. */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function render(overrides: Parameters<typeof makeListing>[0] = {}) {
  return renderToStaticMarkup(<BookingRulesEditor context={context(overrides)} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useRouter.mockReturnValue({ refresh: vi.fn() });
});

describe("the Booking rules section", () => {
  it("is one titled section on the availability page", () => {
    const html = render();
    expect(html).toContain("data-booking-rules");
    expect(html).toContain("Booking rules");
    expect(html).toContain('aria-labelledby="booking-rules-heading"');
  });

  it("offers the two booking styles as one radio group", () => {
    const html = render();
    expect(html).toContain('data-booking-method-choice="FLEXIBLE"');
    expect(html).toContain('data-booking-method-choice="FIXED_STAYS"');
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).toContain("Flexible dates");
    expect(html).toContain("Weekly stays");
  });

  it.each(["FLEXIBLE", "FIXED_STAYS"] as const)(
    "edits the same minimum and maximum stay in %s mode",
    (bookingMode) => {
      // Listing-wide rules: they mean the same thing whichever way the listing sells,
      // so both modes get the same pair rather than a second copy each.
      const html = render({ bookingMode, changeoverWeekday: "SATURDAY" });
      expect(html).toContain("Minimum stay");
      expect(html).toContain("Maximum stay");
      expect(html).toContain('data-stay-limits="true"');
    },
  );

  it("shows the changeover day only for weekly stays", () => {
    expect(render({ bookingMode: "FLEXIBLE" })).not.toContain(
      "host-v2-changeover-day",
    );
    const weekly = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "SATURDAY",
    });
    expect(weekly).toContain('id="host-v2-changeover-day"');
    expect(weekly).toContain(
      '<option value="SATURDAY" selected="">Saturday</option>',
    );
  });

  it("offers all seven days and no stay-length choice at all", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "SATURDAY",
      pricing: limits(7, 28),
    });
    expect(html.match(/<option /g)).toHaveLength(8); // seven days plus "Choose a day…"
    // No week-count checkboxes, and no second select offering lengths.
    expect(html).not.toContain('type="checkbox"');
    expect(html.match(/<select/g)).toHaveLength(1);
  });

  it("states the rule as a sentence built from the day and the maximum", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "SATURDAY",
      pricing: limits(7, 28),
    });
    expect(visibleText(html)).toContain(
      "Guests check in and check out on Saturday. Stays cannot exceed 28 nights.",
    );
  });

  it("generates that sentence from the listing rather than hard-coding it", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "TUESDAY",
      pricing: limits(14, 21),
    });
    const text = visibleText(html);
    expect(text).toContain(
      "Guests check in and check out on Tuesday. Stays cannot exceed 21 nights.",
    );
    expect(text).not.toContain("Saturday.");
    expect(text).not.toContain("28 nights");
  });

  it("states the default 365-night cap because the booking rule enforces it", () => {
    const text = visibleText(
      render({
        bookingMode: "FIXED_STAYS",
        changeoverWeekday: "MONDAY",
        pricing: limits(7, 365),
      }),
    );
    expect(text).toContain("Guests check in and check out on Monday.");
    expect(text).toContain("Stays cannot exceed 365 nights.");
  });

  it("drops the cap clause when the host has set no maximum", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "MONDAY",
      pricing: limits(7, 0),
    });
    const text = visibleText(html);
    expect(text).toContain("Guests check in and check out on Monday.");
    expect(text).not.toContain("cannot exceed");
  });

  it("never enumerates the week lengths the limits permit", () => {
    // Saturday changeover, 7-night minimum, 28-night maximum permits 7, 14, 21 and 28
    // nights. The host configured a day and two numbers; presenting four lengths would
    // present four packages they did not create and cannot individually change.
    const text = visibleText(
      render({
        bookingMode: "FIXED_STAYS",
        changeoverWeekday: "SATURDAY",
        pricing: limits(7, 28),
      }),
    );
    expect(text).not.toMatch(/\d+ weeks?\b/);
    expect(text).not.toContain("14");
    expect(text).not.toContain("21");
  });

  it("flags a weekly listing that has no changeover day yet", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: null,
    });
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("guests cannot book any dates");
    // No rule sentence to state: there is no rule yet.
    expect(html).not.toContain("data-changeover-rule");
  });

  it("blocks saving weekly limits when no whole week fits", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "SATURDAY",
      pricing: limits(8, 13),
    });
    expect(html).toContain(
      "Adjust the minimum and maximum so at least one whole week can be booked.",
    );
    expect(html).toContain('disabled=""');
  });

  it("supports direct number entry and gives all four stepper buttons unique names", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "SATURDAY",
    });
    expect(html.match(/type="number"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Decrease minimum stay"');
    expect(html).toContain('aria-label="Increase minimum stay"');
    expect(html).toContain('aria-label="Decrease maximum stay"');
    expect(html).toContain('aria-label="Increase maximum stay"');
  });

  it("does not write anything while rendering", () => {
    render({ bookingMode: "FIXED_STAYS", changeoverWeekday: "SATURDAY" });
    expect(mocks.setListingBookingMode).not.toHaveBeenCalled();
    expect(mocks.setListingChangeoverWeekday).not.toHaveBeenCalled();
    expect(mocks.setListingStayLimits).not.toHaveBeenCalled();
  });

  it("asks for a price before stay limits it could not apply", () => {
    const html = render({ pricing: null });
    expect(html).not.toContain("data-stay-limits");
    expect(html).toContain("nightly price");
  });
});

describe("nothing on this page overflows a 375px phone", () => {
  /**
   * Horizontal overflow is caused by content that cannot shrink, so this looks for the
   * three things that actually cause it in this codebase — a fixed pixel width, a
   * `min-w` floor above the viewport, and `whitespace-nowrap` on a flex child — rather
   * than trying to lay the page out without a browser.
   */
  it.each([
    ["FLEXIBLE", null],
    ["FIXED_STAYS", "SATURDAY"],
    ["FIXED_STAYS", null],
  ] as const)("in %s mode with changeover %s", (bookingMode, changeoverWeekday) => {
    const html = render({ bookingMode, changeoverWeekday });
    const classes = [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) =>
      m[1].split(/\s+/),
    );
    for (const cls of classes) {
      expect(cls).not.toMatch(/^w-\[\d{3,}px\]$/);
      expect(cls).not.toMatch(/^min-w-\[\d{3,}px\]$/);
      expect(cls).not.toBe("whitespace-nowrap");
    }
    // Every flex row that holds text lets its children shrink; `min-w-0` is what stops
    // a long word forcing the row wider than the phone.
    expect(html).toContain("min-w-0");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { BookingRulesSummary } from "./booking-method-editor";
import { makeListing } from "@/lib/host/v2/__tests__/fixtures";

/**
 * The calendar's booking-rules pane, which no longer edits anything.
 *
 * These tests are mostly about absences, and that is the point. Booking style, minimum
 * stay, maximum stay and changeover day are edited on Availability; a second editable
 * copy here is precisely the defect this pane was reduced to prevent, so the assertions
 * that matter are the ones proving no control survived the move.
 */
/** What the host actually reads: markup stripped, so an assertion about copy cannot
 *  be satisfied — or defeated — by class names and SVG path data. */
function visibleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/** The fixture's pricing rule with just the two stay limits moved. */
function limits(minNights: number, maxNights: number) {
  return { ...makeListing().pricing!, minNights, maxNights };
}

function render(overrides: Parameters<typeof makeListing>[0] = {}) {
  return renderToStaticMarkup(
    <BookingRulesSummary listing={makeListing(overrides)} />,
  );
}

describe("the calendar's booking rules pane", () => {
  it("states a flexible listing in one line", () => {
    const html = render({ bookingMode: "FLEXIBLE" });
    expect(html).toContain("Flexible dates");
    expect(visibleText(html)).not.toContain("Weekly stays");
  });

  it("discloses the default maximum because bookings enforce it", () => {
    // `PricingRule.maxNights` is created at 365 and the booking service enforces it.
    // Hiding that number would make the summary contradict the live rule.
    for (const bookingMode of ["FLEXIBLE", "FIXED_STAYS"] as const) {
      const text = visibleText(
        render({
          bookingMode,
          changeoverWeekday: "SATURDAY",
          pricing: limits(2, 365),
        }),
      );
      expect(text).toContain("365");
    }
  });

  it("states a weekly listing as style, day and maximum", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "SATURDAY",
      pricing: limits(7, 28),
    });
    expect(html).toContain("Weekly stays · Saturday · Maximum 28 nights");
  });

  it("builds that line from the listing, not from a fixed example", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "WEDNESDAY",
      pricing: limits(7, 21),
    });
    expect(html).toContain("Weekly stays · Wednesday · Maximum 21 nights");
    expect(visibleText(html)).not.toContain("Saturday");
    expect(visibleText(html)).not.toContain("28");
  });

  it("leaves out a maximum the host has not set rather than spelling the absence", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "FRIDAY",
      pricing: limits(7, 0),
    });
    expect(html).toContain("Weekly stays · Friday");
    expect(visibleText(html)).not.toContain("Maximum");
  });

  it("flags a weekly listing nobody can book because no day is chosen", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: null,
    });
    expect(html).toContain("no changeover day");
    expect(html).toContain("guests cannot book any dates");
    expect(html).toContain('role="alert"');
  });

  it("carries no editable control for any listing-wide rule", () => {
    for (const html of [
      render({ bookingMode: "FLEXIBLE" }),
      render({
        bookingMode: "FIXED_STAYS",
        changeoverWeekday: "SATURDAY",
        pricing: limits(7, 28),
      }),
    ]) {
      // The three shapes those controls had: radios for the style, steppers for the
      // limits, a select for the day.
      expect(html).not.toContain("<input");
      expect(html).not.toContain("<select");
      expect(html).not.toContain("<button");
      expect(html).not.toContain("data-stay-limits");
      expect(html).not.toContain("data-changeover-day");
      expect(html).not.toContain("data-booking-method-choice");
    }
  });

  it("sends the host to the one place the rules are edited", () => {
    const html = render();
    expect(html).toContain('href="/host/listings/listing-1/availability"');
    expect(html).toContain("Edit booking rules");
  });

  it("still warns that calendar sync cannot carry weekly rules", () => {
    expect(
      render({ bookingMode: "FIXED_STAYS", changeoverWeekday: "SATURDAY" }),
    ).toContain("data-fixed-stay-sync-warning");
    expect(render({ bookingMode: "FLEXIBLE" })).not.toContain(
      "data-fixed-stay-sync-warning",
    );
  });

  it("never enumerates the week lengths its limits happen to permit", () => {
    const html = render({
      bookingMode: "FIXED_STAYS",
      changeoverWeekday: "SATURDAY",
      pricing: limits(7, 28),
    });
    // A 7-night minimum under a 28-night maximum permits 7, 14, 21 and 28. Those are a
    // consequence of two numbers, not four things the host configured, and listing them
    // would read as a menu they could edit.
    const text = visibleText(html);
    expect(text).not.toContain("14");
    expect(text).not.toContain("21");
    expect(text).not.toMatch(/\d+ weeks?/);
  });
});

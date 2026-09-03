import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The listing page's fixed-stay wiring, read off its source.
 *
 * A source-level guard, deliberately, and it is worth saying why. This page is an async
 * server component that loads a listing, a session, reviews, prices and blocked dates
 * before it renders a line; standing it up in a test would mean standing up all of that,
 * and the assertions worth making here are not about any of it. They are four decisions
 * that a future edit could quietly drop, each of which would put a fixed-stay listing
 * back to advertising a calendar a guest cannot use:
 *
 *   - the free availability calendar is not rendered,
 *   - the minimum-nights fact is replaced rather than shown,
 *   - the widget is handed the booking mode and the changeover day.
 *
 * If this file ever fails because the page was restructured rather than because a guard
 * was lost, move the assertion — do not delete it.
 */

const PAGE = readFileSync(
  join(process.cwd(), "src/app/(public)/properties/[slug]/page.tsx"),
  "utf8",
);
const STAY_PICKER = readFileSync(
  join(process.cwd(), "src/components/marketplace/marketplace-stay-date-picker.tsx"),
  "utf8",
);

describe("the public listing page in fixed-stay mode", () => {
  it("decides the mode from the listing's own column", () => {
    expect(PAGE).toContain(
      'const sellsFixedStays = listing.bookingMode === "FIXED_STAYS"',
    );
  });

  it("does not render the free availability calendar", () => {
    expect(PAGE).toContain(
      "const availabilityCalendar = listing.pricingRule && !sellsFixedStays ?",
    );
  });

  it("replaces the minimum-nights fact instead of advertising it", () => {
    expect(PAGE).toContain("const minimumNights = sellsFixedStays");
    expect(PAGE).toContain('"listing.weekly_stays_only", "Weekly stays only"');
  });

  it("hands the widget the mode and the changeover day, and no stay rows", () => {
    expect(PAGE).toContain(
      'bookingMode={sellsFixedStays ? "FIXED_STAYS" : "FLEXIBLE"}',
    );
    expect(PAGE).toContain("changeoverWeekday={listing.changeoverWeekday}");
    // The period model is gone from this page entirely: no projection, no deep-linked
    // stay id, no per-stay props.
    expect(PAGE).not.toContain("getGuestFixedStayPeriods");
    expect(PAGE).not.toContain("fixedStayPeriodId");
    expect(PAGE).not.toContain("fixedStayOptions");
  });

  it("seeds dates from the URL in both modes", () => {
    // A weekly listing books by ordinary dates, so a shared link is a real selection on
    // it — and a range of the wrong shape is refused by the calendar and by the server,
    // rather than being silently dropped here.
    expect(PAGE).toContain("const initialCheckIn = seededStay.checkIn;");
    expect(PAGE).toContain("const initialCheckOut = seededStay.checkOut;");
  });

  it("still seeds guest counts from the URL, in both modes", () => {
    // Guests are not a stay: a link carrying `?adults=2` is answering a different
    // question, and a fixed-stay listing has no reason to ignore it.
    expect(PAGE).toContain("const initialGuestDetails = {");
    expect(PAGE).not.toContain("sellsFixedStays ? undefined : initialGuests");
  });

  it("exposes no host controls from the guest page", () => {
    for (const hostOnly of [
      "setListingBookingMode",
      "fixed-stay.actions",
      "fixed-stay-mutation.service",
    ]) {
      expect(PAGE).not.toContain(hostOnly);
    }
  });

  it("blocks wrong weekly endpoints without disabling the nights between them", () => {
    // react-day-picker's `excludeDisabled` resets a range when any disabled day lies
    // inside it. A Saturday-to-Saturday stay therefore needs weekday enforcement in
    // the custom click guard, not in Calendar's disabled matcher.
    expect(STAY_PICKER).toContain(
      'return { kind: "weekly-changeover", message: changeoverMessage };',
    );
    const matcher = STAY_PICKER.slice(
      STAY_PICKER.indexOf("const disabledMatcher"),
      STAY_PICKER.indexOf("const dateFooter", STAY_PICKER.indexOf("const disabledMatcher")),
    );
    expect(matcher).toContain("...effectiveDisabledRanges");
    expect(matcher).not.toContain("isWrongChangeoverDay");
  });
});

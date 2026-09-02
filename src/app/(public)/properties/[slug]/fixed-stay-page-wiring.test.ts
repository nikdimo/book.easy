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
 *   - `?checkIn=` on a shared link is not adopted as a selection,
 *   - the guest projection is loaded and handed to the widget.
 *
 * If this file ever fails because the page was restructured rather than because a guard
 * was lost, move the assertion — do not delete it.
 */

const PAGE = readFileSync(
  join(process.cwd(), "src/app/(public)/properties/[slug]/page.tsx"),
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
    expect(PAGE).toContain('"listing.fixed_stays_only", "Fixed stays only"');
  });

  it("refuses to seed a selection from arbitrary URL dates", () => {
    // A fixed-stay page never adopts `?checkIn=`. The only dates it can open with are
    // the ones on the row a deep-linked stay resolved to — see the deep-link test below.
    expect(PAGE).toContain("const initialCheckIn = sellsFixedStays");
    expect(PAGE).toContain("const initialCheckOut = sellsFixedStays");
    expect(PAGE).toContain(": seededStay.checkIn");
    expect(PAGE).toContain(": seededStay.checkOut");
    expect(PAGE).not.toContain("sellsFixedStays ? seededStay.checkIn");
  });

  it("still seeds guest counts from the URL, in both modes", () => {
    // Guests are not a stay: a link carrying `?adults=2` is answering a different
    // question, and a fixed-stay listing has no reason to ignore it.
    expect(PAGE).toContain("const initialGuestDetails = {");
    expect(PAGE).not.toContain("sellsFixedStays ? undefined : initialGuests");
  });

  it("loads the guest projection alongside the page's other queries", () => {
    expect(PAGE).toContain(
      'import { getGuestFixedStayPeriods } from "@/lib/services/fixed-stay.service"',
    );
    expect(PAGE).toContain("getGuestFixedStayPeriods(listing.id, todayYmd())");
    // In the same Promise.all as the rest, not as a fifth sequential round trip.
    const promiseAll = PAGE.indexOf("await Promise.all([");
    const projection = PAGE.indexOf("getGuestFixedStayPeriods(listing.id");
    expect(promiseAll).toBeGreaterThan(-1);
    expect(projection).toBeGreaterThan(promiseAll);
  });

  it("hands the widget the mode and the stays", () => {
    expect(PAGE).toContain(
      'bookingMode={sellsFixedStays ? "FIXED_STAYS" : "FLEXIBLE"}',
    );
    expect(PAGE).toContain("fixedStayOptions={fixedStayOptions}");
  });

  it("asks for no stays at all on a flexible listing", () => {
    // A flexible listing must not pay for a query whose answer it would discard.
    expect(PAGE).toContain("sellsFixedStays\n        ? getGuestFixedStayPeriods");
    expect(PAGE).toContain("Promise.resolve(null)");
  });

  it("reads a deep-linked stay as an opaque string, never as dates", () => {
    expect(PAGE).toContain(
      'typeof search.fixedStayPeriodId === "string"',
    );
    // The id is resolved against the listing's own projection, and `selectable` is part
    // of that resolution — a taken stay is as good as an unknown one.
    expect(PAGE).toContain("period.id === requestedFixedStayPeriodId &&");
    expect(PAGE).toContain("period.selectable");
    // The dates it opens on come from that row, never from the query string.
    expect(PAGE).toContain("preselectedFixedStay?.checkIn ?? \"\"");
    expect(PAGE).toContain("preselectedFixedStay?.checkOut ?? \"\"");
    expect(PAGE).toContain(
      "initialFixedStayPeriodId={preselectedFixedStay?.id ?? null}",
    );
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
});

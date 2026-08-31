import { describe, expect, it } from "vitest";
import {
  CALENDAR_FROM_PARAM,
  CALENDAR_INTENT_PARAM,
  CALENDAR_INTENTS,
  CALENDAR_LISTING_PARAM,
  CALENDAR_TO_PARAM,
  HOST_CALENDAR_PATH,
  hostCalendarHref,
  parseCalendarIntentParam,
  parseCalendarListingParam,
  parseCalendarRangeParams,
} from "./calendar-href";

describe("hostCalendarHref", () => {
  it("opens the Host V2 calendar, never the classic one", () => {
    expect(HOST_CALENDAR_PATH).toBe("/host/calendar");
    expect(hostCalendarHref("listing-1")).toBe("/host/calendar?listing=listing-1");
    expect(hostCalendarHref("listing-1")).not.toContain("/host/listings");
  });

  it("preselects the listing through the parameter the calendar page reads", () => {
    expect(CALENDAR_LISTING_PARAM).toBe("listing");
    expect(hostCalendarHref("abc123")).toContain(`?${CALENDAR_LISTING_PARAM}=abc123`);
  });

  it("escapes an id that would otherwise break the query string", () => {
    expect(hostCalendarHref("a b&c")).toBe("/host/calendar?listing=a+b%26c");
  });

  it("falls back to the plain calendar when there is no listing to select", () => {
    expect(hostCalendarHref()).toBe("/host/calendar");
    expect(hostCalendarHref(null)).toBe("/host/calendar");
    expect(hostCalendarHref("   ")).toBe("/host/calendar");
  });
});

describe("intent links", () => {
  it("carries the action the host is part-way through", () => {
    expect(CALENDAR_INTENT_PARAM).toBe("intent");
    expect(hostCalendarHref("listing-1", { intent: "pricing" })).toBe(
      "/host/calendar?listing=listing-1&intent=pricing",
    );
    expect(hostCalendarHref("listing-1", { intent: "availability" })).toContain(
      "intent=availability",
    );
    expect(hostCalendarHref("listing-1", { intent: "promotion" })).toContain(
      "intent=promotion",
    );
  });

  it("names only the three actions the calendar can carry out on selected dates", () => {
    // Nothing here can open a listing-wide editor, because the calendar no longer has
    // one. That is what makes an intent from a link safe to honour.
    expect([...CALENDAR_INTENTS]).toEqual([
      "availability",
      "pricing",
      "promotion",
    ]);
  });

  it("omits the parameter entirely when there is no intent", () => {
    expect(hostCalendarHref("listing-1", {})).toBe(
      "/host/calendar?listing=listing-1",
    );
    expect(hostCalendarHref("listing-1", { intent: null })).toBe(
      "/host/calendar?listing=listing-1",
    );
  });
});

describe("range links", () => {
  it("carries a dated offer's own nights, so the calendar opens on them", () => {
    expect(CALENDAR_FROM_PARAM).toBe("from");
    expect(CALENDAR_TO_PARAM).toBe("to");
    expect(
      hostCalendarHref("listing-1", {
        intent: "promotion",
        range: { from: "2026-07-01", to: "2026-07-14" },
      }),
    ).toBe(
      "/host/calendar?listing=listing-1&intent=promotion&from=2026-07-01&to=2026-07-14",
    );
  });

  it("accepts a single night", () => {
    expect(
      hostCalendarHref("listing-1", {
        range: { from: "2026-07-01", to: "2026-07-01" },
      }),
    ).toContain("from=2026-07-01&to=2026-07-01");
  });

  it("drops a range that is not a range", () => {
    // A backwards range is a caller bug; silently swapping it would hide that.
    for (const range of [
      { from: "2026-07-14", to: "2026-07-01" },
      { from: "", to: "2026-07-01" },
      { from: "2026-07-01", to: "" },
      { from: "01/07/2026", to: "14/07/2026" },
      { from: "2026-02-29", to: "2026-03-01" },
      { from: "2026-13-01", to: "2026-13-02" },
    ]) {
      expect(hostCalendarHref("listing-1", { range })).toBe(
        "/host/calendar?listing=listing-1",
      );
    }
  });

  it("drops a range with no listing to apply it to", () => {
    // Without a property the calendar shows the portfolio overview, which has no grid
    // to select in — a range there would mean nothing.
    expect(
      hostCalendarHref(null, { range: { from: "2026-07-01", to: "2026-07-14" } }),
    ).toBe("/host/calendar");
  });
});

describe("parseCalendarListingParam", () => {
  it("accepts an id-shaped value", () => {
    expect(parseCalendarListingParam("clx1a2b3c4d5")).toBe("clx1a2b3c4d5");
    expect(parseCalendarListingParam(" clx1a2b3 ")).toBe("clx1a2b3");
    expect(parseCalendarListingParam("a-b_c")).toBe("a-b_c");
  });

  it("drops anything that could not be an id, so it never reaches a query", () => {
    expect(parseCalendarListingParam(undefined)).toBeNull();
    expect(parseCalendarListingParam("")).toBeNull();
    expect(parseCalendarListingParam("  ")).toBeNull();
    // A repeated `?listing=` parameter arrives as an array.
    expect(parseCalendarListingParam(["a", "b"])).toBeNull();
    expect(parseCalendarListingParam("' OR 1=1 --")).toBeNull();
    expect(parseCalendarListingParam("../../admin")).toBeNull();
    expect(parseCalendarListingParam("<script>")).toBeNull();
    expect(parseCalendarListingParam("x".repeat(65))).toBeNull();
  });

  it("passes a well-formed id belonging to someone else straight through", () => {
    // Shape is all this checks. Ownership is the workspace payload's job: it is scoped
    // to the signed-in host, so a foreign id simply is not in it and the calendar falls
    // back to the host's default listing.
    expect(parseCalendarListingParam("someoneElsesListing")).toBe("someoneElsesListing");
  });
});

describe("parseCalendarIntentParam", () => {
  it("accepts each known intent", () => {
    for (const intent of CALENDAR_INTENTS) {
      expect(parseCalendarIntentParam(intent)).toBe(intent);
    }
  });

  it("rejects an unknown word rather than guessing at one", () => {
    expect(parseCalendarIntentParam("defaults")).toBeNull();
    expect(parseCalendarIntentParam("PRICING")).toBeNull();
    expect(parseCalendarIntentParam("listing_promotions")).toBeNull();
    expect(parseCalendarIntentParam("")).toBeNull();
    expect(parseCalendarIntentParam("   ")).toBeNull();
    expect(parseCalendarIntentParam(undefined)).toBeNull();
  });

  it("rejects a repeated parameter, which arrives as an array", () => {
    expect(parseCalendarIntentParam(["pricing", "availability"])).toBeNull();
    expect(parseCalendarIntentParam(["pricing"])).toBeNull();
  });
});

describe("parseCalendarRangeParams", () => {
  it("accepts a well-formed inclusive range", () => {
    expect(parseCalendarRangeParams("2026-07-01", "2026-07-14")).toEqual({
      from: "2026-07-01",
      to: "2026-07-14",
    });
    expect(parseCalendarRangeParams(" 2026-07-01 ", " 2026-07-01 ")).toEqual({
      from: "2026-07-01",
      to: "2026-07-01",
    });
  });

  it("needs both halves — half a range is not a range", () => {
    expect(parseCalendarRangeParams("2026-07-01", undefined)).toBeNull();
    expect(parseCalendarRangeParams(undefined, "2026-07-14")).toBeNull();
    expect(parseCalendarRangeParams(undefined, undefined)).toBeNull();
  });

  it("rejects repeated, malformed and backwards values", () => {
    expect(parseCalendarRangeParams(["2026-07-01"], "2026-07-14")).toBeNull();
    expect(parseCalendarRangeParams("2026-07-01", ["2026-07-14"])).toBeNull();
    expect(parseCalendarRangeParams("yesterday", "tomorrow")).toBeNull();
    expect(parseCalendarRangeParams("2026-7-1", "2026-07-14")).toBeNull();
    expect(parseCalendarRangeParams("2026-02-30", "2026-03-01")).toBeNull();
    expect(parseCalendarRangeParams("2026-00-01", "2026-01-01")).toBeNull();
    expect(parseCalendarRangeParams("2026-07-14", "2026-07-01")).toBeNull();
  });
});

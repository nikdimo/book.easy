import { describe, expect, it } from "vitest";
import {
  CALENDAR_LISTING_PARAM,
  HOST_CALENDAR_PATH,
  hostCalendarHref,
  parseCalendarListingParam,
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
    expect(hostCalendarHref("a b&c")).toBe("/host/calendar?listing=a%20b%26c");
  });

  it("falls back to the plain calendar when there is no listing to select", () => {
    expect(hostCalendarHref()).toBe("/host/calendar");
    expect(hostCalendarHref(null)).toBe("/host/calendar");
    expect(hostCalendarHref("   ")).toBe("/host/calendar");
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

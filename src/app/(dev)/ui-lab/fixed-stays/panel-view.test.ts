import { describe, expect, it } from "vitest";
import {
  LISTING_MENU,
  MENU_VIEW,
  backFrom,
  bookingMethodSummary,
  editorLabel,
  openEditor,
} from "./panel-view";

describe("the listing-wide menu", () => {
  it("offers the four settings the product decided on, in order", () => {
    expect(LISTING_MENU.map(editorLabel)).toEqual([
      "Listing visibility",
      "Booking method",
      "Default pricing",
      "Promotions",
    ]);
  });
});

describe("navigating the panel", () => {
  it("opens exactly one editor at a time", () => {
    expect(openEditor("booking-method")).toEqual({
      kind: "editor",
      editor: "booking-method",
    });
  });

  it("climbs to the menu from an editor, and stays put on the menu", () => {
    expect(backFrom(openEditor("pricing"))).toEqual(MENU_VIEW);
    expect(backFrom(MENU_VIEW)).toEqual(MENU_VIEW);
  });
});

describe("what the Booking method row says without being opened", () => {
  it("names the method when dates are flexible, and says nothing about counts", () => {
    expect(bookingMethodSummary("flexible", 7)).toBe("Flexible dates");
  });

  it("counts what a guest could actually be shown when stays are fixed", () => {
    expect(bookingMethodSummary("fixed", 7)).toBe("Fixed stays · 7 offered");
    // A host who has switched the mode on and added nothing is the state most worth
    // reading off the menu, so it gets a number rather than an empty phrase.
    expect(bookingMethodSummary("fixed", 0)).toBe("Fixed stays · 0 offered");
  });
});

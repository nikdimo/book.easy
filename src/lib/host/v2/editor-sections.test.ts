import { describe, expect, it } from "vitest";
import {
  EDITOR_COMPLETION_SECTIONS,
  EDITOR_NAV_GROUPS,
  EDITOR_NAV_ITEMS,
  EDITOR_OVERVIEW_SLUG,
  EDITOR_SECTIONS,
  editorCompletedSections,
  editorCompletionCount,
  editorSectionHref,
  findEditorSection,
} from "./editor-sections";

describe("listing editor navigation", () => {
  it("keeps the final order, labels, and grouping", () => {
    expect(EDITOR_SECTIONS.map(({ slug }) => slug)).toEqual([
      "availability", "pricing", "photos", "basics", "rooms", "location", "amenities", "payment-arrangements", "house-rules", "arrival-guide",
    ]);
    expect(EDITOR_SECTIONS.map(({ source }) => source)).toEqual([
      "Availability", "Pricing", "Photos", "Title & description", "Property details", "Location", "Amenities", "Payment arrangements", "House rules", "Arrival guide",
    ]);
    expect(EDITOR_SECTIONS.filter((section) => section.group === "calendar").map(({ slug }) => slug)).toEqual(["availability", "pricing"]);
  });

  it("renders three groups in the required order", () => {
    expect(EDITOR_NAV_GROUPS.map(({ id }) => id)).toEqual([
      "overview",
      "calendar",
      "details",
    ]);
    expect(EDITOR_NAV_GROUPS.map(({ source }) => source)).toEqual([
      "Overview",
      "Calendar settings",
      "Listing details",
    ]);
  });

  it("lists every implemented item in the required order", () => {
    expect(
      EDITOR_NAV_GROUPS.map((group) => group.items.map((item) => item.source)),
    ).toEqual([
      ["Listing overview"],
      ["Open calendar", "Availability", "Pricing"],
      [
        "Photos",
        "Title & description",
        "Property details",
        "Location",
        "Amenities",
        "Payment arrangements",
        "House rules",
        "Arrival guide",
      ],
    ]);
  });

  it("has no placeholder items: every entry is a route that exists", () => {
    // "Rooms and spaces" deliberately does not appear — rooms are managed inside
    // Property details, which is where the V2 route actually lives.
    expect(EDITOR_NAV_ITEMS.map((item) => item.source)).not.toContain("Rooms and spaces");
    // Every section is built, so there is no "built" flag left to check and no
    // placeholder route behind any of these: each href below is a real page.
    expect(EDITOR_NAV_ITEMS.every((item) => item.href("listing-1").startsWith("/host/"))).toBe(true);
  });

  it("points each navigation item at its real Host V2 route", () => {
    const hrefs = Object.fromEntries(
      EDITOR_NAV_ITEMS.map((item) => [item.source, item.href("listing-1")]),
    );
    expect(hrefs).toEqual({
      "Listing overview": "/host/listings/listing-1",
      // The new calendar, never the classic host one, with this listing preselected.
      "Open calendar": "/host/calendar?listing=listing-1",
      Availability: "/host/listings/listing-1/availability",
      Pricing: "/host/listings/listing-1/pricing",
      Photos: "/host/listings/listing-1/photos",
      "Title & description": "/host/listings/listing-1/basics",
      "Property details": "/host/listings/listing-1/rooms",
      Location: "/host/listings/listing-1/location",
      Amenities: "/host/listings/listing-1/amenities",
      "Payment arrangements": "/host/listings/listing-1/payment-arrangements",
      "House rules": "/host/listings/listing-1/house-rules",
      "Arrival guide": "/host/listings/listing-1/arrival-guide",
    });
  });

  it("marks only Calendar as leaving the editor", () => {
    expect(
      EDITOR_NAV_ITEMS.filter((item) => item.external).map((item) => item.slug),
    ).toEqual(["open-calendar"]);
  });

  it("puts Overview on the base route and every section on its own slug", () => {
    expect(editorSectionHref("listing-1", EDITOR_OVERVIEW_SLUG)).toBe(
      "/host/listings/listing-1",
    );
    expect(editorSectionHref("listing-1", "photos")).toBe(
      "/host/listings/listing-1/photos",
    );
    // Overview is not a section: nothing about it counts toward completion.
    expect(findEditorSection(EDITOR_OVERVIEW_SLUG)).toBeUndefined();
  });

  it("excludes Calendar-managed sections from completion totals", () => {
    // House rules counts: `Listing.houseRulesReviewedAt` records the visit, so the tick
    // is a stored fact rather than an inference from fields that always have values.
    // Arrival guide still has no such column.
    expect(EDITOR_COMPLETION_SECTIONS.map(({ slug }) => slug)).toEqual([
      "photos", "basics", "rooms", "location", "payment-arrangements", "house-rules",
    ]);
    expect(editorCompletionCount(["photos", "basics", "pricing", "availability"])).toBe(2);
  });

  it("keeps shared completion checks stable across routes", () => {
    expect(editorCompletedSections({ photoCount: 3, basicsComplete: true, propertyDetailsComplete: true, locationComplete: true, paymentMethodsReviewed: true, houseRulesReviewed: true })).toEqual([
      "photos",
      "basics",
      "rooms",
      "location",
      "payment-arrangements",
      "house-rules",
    ]);
    expect(editorCompletedSections({ photoCount: 0, basicsComplete: false, propertyDetailsComplete: false, locationComplete: false, paymentMethodsReviewed: false, houseRulesReviewed: false })).toEqual([]);
  });

  it("can reach full completion without making optional amenities mandatory", () => {
    const complete = editorCompletedSections({ photoCount: 3, basicsComplete: true, propertyDetailsComplete: true, locationComplete: true, paymentMethodsReviewed: true, houseRulesReviewed: true });
    expect(editorCompletionCount(complete)).toBe(EDITOR_COMPLETION_SECTIONS.length);
  });

  it("requires the same photo minimum as publishing", () => {
    const base = { basicsComplete: false, propertyDetailsComplete: false, locationComplete: false, paymentMethodsReviewed: false, houseRulesReviewed: false };
    expect(editorCompletedSections({ ...base, photoCount: 2 })).toEqual([]);
    expect(editorCompletedSections({ ...base, photoCount: 3 })).toEqual(["photos"]);
  });

  it("ticks House rules only for a host who actually saved it", () => {
    // Never inferred from the rules having values — a listing has a guest count and an
    // arrival time from the moment it exists, whether or not anyone reviewed them.
    const base = { photoCount: 0, basicsComplete: false, propertyDetailsComplete: false, locationComplete: false, paymentMethodsReviewed: false };

    expect(editorCompletedSections({ ...base, houseRulesReviewed: true })).toEqual(["house-rules"]);
    expect(editorCompletedSections({ ...base, houseRulesReviewed: false })).toEqual([]);
  });

  it("ticks Payment arrangements only after the host deliberately saves it", () => {
    const base = { photoCount: 0, basicsComplete: false, propertyDetailsComplete: false, locationComplete: false, houseRulesReviewed: false };
    expect(editorCompletedSections({ ...base, paymentMethodsReviewed: true })).toEqual(["payment-arrangements"]);
    expect(editorCompletedSections({ ...base, paymentMethodsReviewed: false })).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  EDITOR_COMPLETION_SECTIONS,
  EDITOR_NAV_GROUPS,
  EDITOR_NAV_ITEMS,
  EDITOR_SPACE_SECTIONS,
  EDITOR_OVERVIEW_SLUG,
  EDITOR_SECTIONS,
  editorCompletedSections,
  editorSectionHref,
  editorSectionFromPathname,
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
      // Not "Calendar settings": these two pages set what a stay costs and when it can
      // be had, and naming them after the calendar sent hosts to the calendar looking
      // for a base price. The group id stays `calendar`, because only the label moved.
      "Rates & availability",
      "Listing details",
    ]);
  });

  it("lists every implemented item in the required order", () => {
    expect(
      EDITOR_NAV_GROUPS.map((group) => group.items.map((item) => item.source)),
    ).toEqual([
      ["Listing overview"],
      ["Availability", "Pricing"],
      [
        "Photos",
        "Title & description",
        "Property details",
        "Location",
        "Amenities",
        "Payment arrangements",
        "House rules",
      ],
    ]);
  });

  it("keeps the Arrival guide out of the navigation but still a real section", () => {
    // It is the editor's other half now, reached by the toggle above both columns rather
    // than by a tenth row at the bottom of the rail. Both halves of that claim matter: a
    // row would put the switch on only one side, and dropping it from `EDITOR_SECTIONS`
    // altogether would stop `editorSectionFromPathname` recognising its URL — which is
    // what the header's listing switcher uses to keep a host on the page they were on.
    expect(EDITOR_NAV_ITEMS.map((item) => item.slug)).not.toContain("arrival-guide");
    expect(EDITOR_SPACE_SECTIONS.map((section) => section.slug)).not.toContain(
      "arrival-guide",
    );
    expect(findEditorSection("arrival-guide")).toBeDefined();
    expect(findEditorSection("arrival-guide")?.half).toBe("arrival");
    expect(editorSectionFromPathname("/host/listings/listing-1/arrival-guide")).toBe(
      "arrival-guide",
    );
    // A card inside the guide is still the guide, not an unknown section.
    expect(
      editorSectionFromPathname("/host/listings/listing-1/arrival-guide/wifi-details"),
    ).toBe("arrival-guide");
  });

  it("puts every other section in the space half", () => {
    expect(
      EDITOR_SECTIONS.filter((section) => section.half === "arrival").map((s) => s.slug),
    ).toEqual(["arrival-guide"]);
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
      Availability: "/host/listings/listing-1/availability",
      Pricing: "/host/listings/listing-1/pricing",
      Photos: "/host/listings/listing-1/photos",
      "Title & description": "/host/listings/listing-1/basics",
      "Property details": "/host/listings/listing-1/rooms",
      Location: "/host/listings/listing-1/location",
      Amenities: "/host/listings/listing-1/amenities",
      "Payment arrangements": "/host/listings/listing-1/payment-arrangements",
      "House rules": "/host/listings/listing-1/house-rules",
    });
  });

  it("has no generic 'Open calendar' entry anywhere in the navigation", () => {
    // It left the editor without saying what for, from a rail row sitting above the
    // two sections that now own the settings hosts were going to the calendar to find.
    // The calendar is still reachable — from contextual links inside Pricing and
    // Availability that name the date-specific job, and from the header's overflow
    // menu — but never as an unexplained navigation item.
    expect(EDITOR_NAV_ITEMS.map((item) => item.source)).not.toContain("Open calendar");
    expect(EDITOR_NAV_ITEMS.map((item) => item.slug)).not.toContain("open-calendar");
  });

  it("keeps every navigation entry inside the editor", () => {
    for (const item of EDITOR_NAV_ITEMS) {
      expect(item.href("listing-1")).toMatch(/^\/host\/listings\/listing-1/);
    }
  });

  it("keeps Rates & availability to exactly Availability and Pricing", () => {
    // No separate Promotions section: ongoing offers are part of what a stay costs, so
    // they live inside Pricing rather than in a third page beside it.
    const group = EDITOR_NAV_GROUPS.find((candidate) => candidate.id === "calendar");
    expect(group?.items.map((item) => item.slug)).toEqual([
      "availability",
      "pricing",
    ]);
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

  it("leaves Availability and Pricing out of the completable set", () => {
    // Neither is an ordinary completion section, and neither became one by gaining a
    // form. Availability always has a persisted default, so there is no state in which
    // it is unfinished; a listing with no pricing rule is flagged separately by
    // `editorAttentionItems`, which is a blocked sale rather than an unfinished form.
    expect(
      EDITOR_COMPLETION_SECTIONS.map(({ slug }) => slug),
    ).not.toContain("availability");
    expect(EDITOR_COMPLETION_SECTIONS.map(({ slug }) => slug)).not.toContain("pricing");
  });

  it("excludes Calendar-managed sections from the completable set", () => {
    // House rules counts: `Listing.houseRulesReviewedAt` records the visit, so
    // "unanswered" is a stored fact rather than an inference from fields that always
    // have values. Arrival guide still has no such column.
    expect(EDITOR_COMPLETION_SECTIONS.map(({ slug }) => slug)).toEqual([
      "photos", "basics", "rooms", "location", "payment-arrangements", "house-rules",
    ]);
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

  it("can finish every completable section without making optional amenities mandatory", () => {
    const complete = editorCompletedSections({ photoCount: 3, basicsComplete: true, propertyDetailsComplete: true, locationComplete: true, paymentMethodsReviewed: true, houseRulesReviewed: true });
    expect(complete).toHaveLength(EDITOR_COMPLETION_SECTIONS.length);
  });

  it("requires the same photo minimum as publishing", () => {
    const base = { basicsComplete: false, propertyDetailsComplete: false, locationComplete: false, paymentMethodsReviewed: false, houseRulesReviewed: false };
    expect(editorCompletedSections({ ...base, photoCount: 2 })).toEqual([]);
    expect(editorCompletedSections({ ...base, photoCount: 3 })).toEqual(["photos"]);
  });

  it("clears House rules only for a host who actually saved it", () => {
    // Never inferred from the rules having values — a listing has a guest count and an
    // arrival time from the moment it exists, whether or not anyone reviewed them.
    const base = { photoCount: 0, basicsComplete: false, propertyDetailsComplete: false, locationComplete: false, paymentMethodsReviewed: false };

    expect(editorCompletedSections({ ...base, houseRulesReviewed: true })).toEqual(["house-rules"]);
    expect(editorCompletedSections({ ...base, houseRulesReviewed: false })).toEqual([]);
  });

  it("clears Payment arrangements only after the host deliberately saves it", () => {
    const base = { photoCount: 0, basicsComplete: false, propertyDetailsComplete: false, locationComplete: false, houseRulesReviewed: false };
    expect(editorCompletedSections({ ...base, paymentMethodsReviewed: true })).toEqual(["payment-arrangements"]);
    expect(editorCompletedSections({ ...base, paymentMethodsReviewed: false })).toEqual([]);
  });
});

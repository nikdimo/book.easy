import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorOverview } from "@/components/host/v2/editor/overview/editor-overview";
import type { ListingEditorOverview } from "@/lib/services/listing-editor.service";
import type { Translator } from "@/lib/i18n/t";

/** Source-locale translator: every key falls back to its English literal, which is
 *  what an untranslated request renders with. */
const t: Translator = {
  locale: "en",
  requestedLocale: "en",
  catalogReady: true,
  messages: {},
  resolve: (_key, source) => ({ text: source, translated: false }),
};

const complete: ListingEditorOverview = {
  id: "listing-1",
  title: "Sunny loft by the river",
  status: "APPROVED",
  slug: "sunny-loft",
  coverUrl: "/uploads/cover.jpg",
  locationLabel: "Debar Maalo, Skopje, North Macedonia",
  photoCount: 12,
  roomCount: 3,
  amenityCount: 9,
  nightlyRate: { amount: 60, currency: "EUR" },
  availabilityMode: "OPEN",
  houseRulesReviewed: true,
  paymentMethodsReviewed: true,
  completeSections: ["photos", "basics", "rooms", "location", "payment-arrangements", "house-rules"],
  attention: [],
};

const empty: ListingEditorOverview = {
  id: "listing-2",
  title: "Untitled",
  status: "DRAFT",
  slug: "untitled",
  coverUrl: null,
  locationLabel: null,
  photoCount: 0,
  roomCount: 0,
  amenityCount: 0,
  nightlyRate: null,
  availabilityMode: "CLOSED",
  houseRulesReviewed: false,
  paymentMethodsReviewed: false,
  completeSections: [],
  // Everything the shared attention set flags for a listing with nothing filled in,
  // price first. Pricing appears here and never could as a checkmark.
  attention: [
    "pricing",
    "photos",
    "basics",
    "rooms",
    "location",
    "payment-arrangements",
    "house-rules",
  ],
};

const render = (overview: ListingEditorOverview) =>
  renderToStaticMarkup(<EditorOverview overview={overview} t={t} />);

describe("EditorOverview summary card", () => {
  it("shows the listing's own identity and status", () => {
    const html = render(complete);
    expect(html).toContain("Sunny loft by the river");
    expect(html).toContain("Debar Maalo, Skopje, North Macedonia");
    expect(html).toContain("Approved");
    expect(html).toContain("cover.jpg");
  });

  it("offers View as guest only for a listing a guest could open", () => {
    // The public route serves approved listings alone, so the control would be a link
    // to a 404 on anything else.
    expect(render(complete)).toContain("View as guest");
    expect(render(complete)).toContain('href="/properties/sunny-loft"');
    expect(render(empty)).not.toContain("View as guest");
  });

  it("states the empty photo case rather than showing a broken frame", () => {
    const html = render(empty);
    expect(html).toContain("No cover photo");
    expect(html).toContain("No address yet");
  });
});

describe("EditorOverview attention area", () => {
  it("reports a clear completed state when nothing is outstanding", () => {
    const html = render(complete);
    expect(html).toContain("Needs your attention");
    expect(html).toContain("Nothing needs attention.");
    expect(html).not.toContain("No nightly price is set");
  });

  it("lists the real open tasks, each linking to its own section", () => {
    const html = render(empty);
    expect(html).toContain("No nightly price is set, so no date can be booked.");
    expect(html).toContain("Add at least 3 photos before publishing.");
    expect(html).toContain("House rules have not been reviewed.");
    expect(html).toContain(
      "Choose accepted payment methods and whether a deposit is required.",
    );
    expect(html).toContain('href="/host/listings/listing-2/photos"');
    expect(html).toContain('href="/host/listings/listing-2/house-rules"');
    expect(html).toContain('href="/host/listings/listing-2/payment-arrangements"');
  });

  it("does not flag optional sections", () => {
    // Arrival guide has no stored completion state, so an empty one is never an alarm.
    const html = render(empty);
    expect(html).not.toContain("arrival guide is");
  });
});

describe("EditorOverview all-sections area", () => {
  it("groups every implemented section the way the rail does", () => {
    const html = render(complete);
    expect(html).toContain("All sections");
    expect(html).toContain("Calendar settings");
    expect(html).toContain("Listing details");
    expect(html.indexOf("Calendar settings")).toBeLessThan(
      html.indexOf("Listing details"),
    );
  });

  it("links each card at its real Host V2 route", () => {
    const html = render(complete);
    for (const href of [
      "/host/calendar?listing=listing-1",
      "/host/listings/listing-1/availability",
      "/host/listings/listing-1/pricing",
      "/host/listings/listing-1/photos",
      "/host/listings/listing-1/basics",
      "/host/listings/listing-1/rooms",
      "/host/listings/listing-1/location",
      "/host/listings/listing-1/amenities",
      "/host/listings/listing-1/payment-arrangements",
      "/host/listings/listing-1/house-rules",
      "/host/listings/listing-1/arrival-guide",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("never sends an editing action back to the classic host panel", () => {
    expect(render(complete)).not.toContain("/host/v2");
    expect(render(empty)).not.toContain("/host/v2");
    expect(render(complete)).not.toContain("/host/listings/listing-1/edit");
    expect(render(empty)).not.toContain("/host/listings/listing-1/edit");
  });

  it("carries a real summary of what each section currently holds", () => {
    const html = render(complete);
    expect(html).toContain("12 photos");
    expect(html).toContain("3 rooms and spaces");
    expect(html).toContain("9 amenities");
    expect(html).toContain("€60 per night");
    expect(html).toContain("Open by default");
    expect(html).toContain("Reviewed");
    expect(html).toContain("Nothing needs attention");
  });

  it("summarises the empty listing honestly", () => {
    const html = render(empty);
    expect(html).toContain("No photos yet");
    expect(html).toContain("No rooms added yet");
    expect(html).toContain("Nothing selected yet");
    expect(html).toContain("No nightly price set");
    expect(html).toContain("Closed by default");
    expect(html).toContain("7 things need your attention");
  });

  it("does not repeat itself as a section card", () => {
    const html = render(complete);
    expect(html).not.toContain('href="/host/listings/listing-1"');
  });
});

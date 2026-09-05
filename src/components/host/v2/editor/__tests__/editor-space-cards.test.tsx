import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorSpaceCards } from "@/components/host/v2/editor/editor-space-cards";
import { EDITOR_LEFT_COLUMN_CLASS } from "@/lib/host/v2/editor-layout";
import type { ListingEditorOverview } from "@/lib/services/listing-editor.service";

const overview: ListingEditorOverview = {
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
  completeSections: [
    "photos",
    "basics",
    "rooms",
    "location",
    "payment-arrangements",
    "house-rules",
  ],
  attention: [],
};

/** No I18nProvider: `useI18n` falls back to the English source literals, which is what an
 *  untranslated request renders with. */
const render = (
  current: string,
  attention: string[] = [],
  data: ListingEditorOverview | null = overview,
) =>
  renderToStaticMarkup(
    <EditorSpaceCards
      listingId="listing-1"
      current={current}
      overview={data}
      attention={attention}
    />,
  );

describe("EditorSpaceCards", () => {
  it("renders the two groups in the required order", () => {
    const html = render("overview");
    const order = ["Overview", "Rates &amp; availability", "Listing details"];
    const positions = order.map((heading) => html.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("renders every section in the required order", () => {
    const html = render("photos");
    const order = [
      "Listing overview",
      "Availability",
      "Pricing",
      "Photos",
      "Title &amp; description",
      "Property details",
      "Location",
      "Amenities",
      "Payment arrangements",
      "House rules",
    ];
    const positions = order.map((label) => html.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("does not carry the Arrival guide, which is the editor's other half", () => {
    const html = render("photos");
    expect(html).not.toContain("Arrival guide");
    expect(html).not.toContain("/arrival-guide");
  });

  it("draws the same column the Arrival guide draws", () => {
    // The whole reason this component exists: pressing the halves toggle must not resize
    // or restyle the column under the host's cursor.
    const html = render("photos");
    expect(html).toContain(EDITOR_LEFT_COLUMN_CLASS);
    expect(html).toContain("ag-list-card");
  });

  it("labels each card with the section's own summary", () => {
    const html = render("photos");
    expect(html).toContain("12 photos");
    expect(html).toContain("Debar Maalo, Skopje, North Macedonia");
    expect(html).toContain("9 amenities");
  });

  it("falls back to bare labels when no summaries were loaded", () => {
    const html = render("photos", [], null);
    expect(html).toContain("Photos");
    expect(html).not.toContain("12 photos");
  });

  it("marks the current section, and only it, as the active page", () => {
    const html = render("photos");
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1);
    expect(html).toContain('href="/host/listings/listing-1/photos"');
  });

  it("marks Overview active on the base route", () => {
    expect(render("overview")).toContain('aria-current="page"');
    // A removed legacy slug cannot mark any current editor page active.
    expect(render("open-calendar")).not.toContain('aria-current="page"');
  });

  it("flags the sections the shared attention set reports as open", () => {
    const html = render("photos", ["basics", "location"]);
    expect(html).toContain("lucide-circle-alert");
    expect(html).toContain("2 things need your attention");
  });

  it("says so plainly when nothing is outstanding", () => {
    const html = render("photos", []);
    expect(html).toContain("Nothing needs attention");
    expect(html).not.toContain("lucide-circle-alert");
  });

  it("can flag Pricing, which no checkmark could ever mark", () => {
    // Pricing is not a completion section — it has no tick — but a listing without a
    // nightly price cannot be booked, which is the most serious open task there is.
    const html = render("photos", ["pricing"]);
    expect(html).toContain("lucide-circle-alert");
    expect(html).toContain("1 thing needs your attention");
  });

  it("never marks a section that is merely optional", () => {
    const html = render("photos", ["basics"]);
    // Each card's own markup ends at its closing </a>; the count line below carries the
    // icon too and is not part of any card.
    const card = (label: string) => {
      const start = html.indexOf(label);
      expect(start).toBeGreaterThan(-1);
      return html.slice(start, html.indexOf("</a>", start));
    };
    expect(card("Amenities")).not.toContain("lucide-circle-alert");
    // The one section that is flagged still is, so the assertion above is not vacuous.
    expect(card("Title &amp; description")).toContain("lucide-circle-alert");
  });
});

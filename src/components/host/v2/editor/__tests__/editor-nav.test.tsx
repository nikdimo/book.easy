import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorNav } from "@/components/host/v2/editor/editor-nav";

/** No I18nProvider: `useI18n` falls back to the English source literals, which is what
 *  an untranslated request renders with. */
const render = (current: string, attention: string[] = []) =>
  renderToStaticMarkup(
    <EditorNav listingId="listing-1" current={current} attention={attention} />,
  );

/** Just the desktop rail. The markup also contains the small-screen chip row, which
 *  shows a moving window of the same list, so ordering has to be read from the one
 *  shape that renders every item exactly once. */
const rail = (current: string, attention: string[] = []) => {
  const parts = render(current, attention).split("<nav");
  return parts[parts.length - 1];
};

describe("EditorNav rail", () => {
  it("renders the three groups in the required order", () => {
    const html = rail("overview");
    const order = ["Overview", "Rates &amp; availability", "Listing details"];
    const positions = order.map((heading) => html.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("renders every item in the required order", () => {
    const html = rail("photos");
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
      "Arrival guide",
    ];
    const positions = order.map((label) => html.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("points Overview at the base editor route", () => {
    expect(render("overview")).toContain('href="/host/listings/listing-1"');
  });

  it("does not duplicate Calendar as a generic editor navigation item", () => {
    const html = render("overview");
    expect(html).not.toContain("Open calendar");
    expect(html).not.toContain('href="/host/calendar?listing=listing-1"');
    expect(html).not.toContain("/host/v2");
    expect(html).not.toContain("/host/listings/listing-1/edit");
  });

  it("marks the current item, and only it, as the active page", () => {
    const html = render("photos");
    // Marked in the chip row and in the rail — the same section in both shapes, and
    // nothing else in either.
    const active = html.match(/aria-current="page"/g) ?? [];
    expect(active).toHaveLength(2);
    expect(html).toContain('href="/host/listings/listing-1/photos"');
  });

  it("marks Overview active on the base route", () => {
    expect(render("overview")).toContain("aria-current=\"page\"");
    // A removed legacy slug cannot mark any current editor page active.
    expect(render("open-calendar")).not.toContain("aria-current=\"page\"");
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
    // Amenities and Arrival guide have no persisted reviewed state, so they are never
    // in the attention set and an unmarked row means only "nothing to do here".
    const html = rail("photos", ["basics"]);
    // Each row's own markup ends at its closing </a>; the footer below carries the
    // count's icon and is not part of either row.
    const row = (label: string) => {
      const start = html.indexOf(label);
      return html.slice(start, html.indexOf("</a>", start));
    };
    expect(row("Amenities")).not.toContain("lucide-circle-alert");
    expect(row("Arrival guide")).not.toContain("lucide-circle-alert");
    // The one section that is flagged still is, so the assertion above is not vacuous.
    expect(row("Title &amp; description")).toContain("lucide-circle-alert");
  });
});

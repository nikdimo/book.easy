import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorNav } from "@/components/host/v2/editor/editor-nav";

/** No I18nProvider: `useI18n` falls back to the English source literals, which is what
 *  an untranslated request renders with. */
const render = (current: string, complete: string[] = []) =>
  renderToStaticMarkup(
    <EditorNav listingId="listing-1" current={current} complete={complete} />,
  );

/** Just the desktop rail. The markup also contains the small-screen chip row, which
 *  shows a moving window of the same list, so ordering has to be read from the one
 *  shape that renders every item exactly once. */
const rail = (current: string, complete: string[] = []) => {
  const parts = render(current, complete).split("<nav");
  return parts[parts.length - 1];
};

describe("EditorNav rail", () => {
  it("renders the three groups in the required order", () => {
    const html = rail("overview");
    const order = ["Overview", "Calendar settings", "Listing details"];
    const positions = order.map((heading) => html.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("renders every item in the required order", () => {
    const html = rail("photos");
    const order = [
      "Listing overview",
      "Open calendar",
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

  it("opens the Host V2 calendar on the listing being edited", () => {
    const html = render("overview");
    expect(html).toContain('href="/host/calendar?listing=listing-1"');
    // Never the internal version URL or the classic editor suffix.
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
    // Calendar leaves the editor, so it is never the active page.
    expect(render("open-calendar")).not.toContain("aria-current=\"page\"");
  });

  it("ticks the sections the shared completion set reports as done", () => {
    const html = render("photos", ["basics", "location"]);
    expect(html).toContain("lucide-check");
    expect(html).toContain("2 of 6 complete");
  });

  it("counts progress out of the completion sections only", () => {
    // Availability and Pricing are Calendar handoffs, so they never inflate the total.
    expect(render("photos", ["pricing", "availability"])).toContain("0 of 6 complete");
  });
});

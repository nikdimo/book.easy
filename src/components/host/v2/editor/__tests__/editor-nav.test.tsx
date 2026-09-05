import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorNav } from "@/components/host/v2/editor/editor-nav";

/** No I18nProvider: `useI18n` falls back to the English source literals, which is what
 *  an untranslated request renders with. */
const render = (current: string, attention: string[] = []) =>
  renderToStaticMarkup(
    <EditorNav listingId="listing-1" current={current} attention={attention} />,
  );

/**
 * Only the small-screen chip row now.
 *
 * `EditorNav` used to render a desktop rail as well; from `lg` up the left column is
 * `EditorSpaceCards` — the same column the Arrival guide draws — so what the rail asserted
 * lives in `editor-space-cards.test.tsx`. What is left here is the phone's window of chips
 * plus its "More" menu, which is the one shape that does *not* render every item.
 */

describe("EditorNav chip row", () => {
  it("shows a window of chips around the current section", () => {
    const html = render("photos");
    // Three chips fit a 360px screen; the current one is always among them.
    expect(html).toContain('href="/host/listings/listing-1/photos"');
    expect(html).toContain("More");
  });

  it("windows the chips around the current section rather than scrolling them", () => {
    // Three chips: the current one and its neighbours. The rest are behind "More", whose
    // menu is a Radix popover and so is not in the server markup at all — which is why
    // this asserts the window rather than the whole list.
    const html = render("photos");
    expect(html).toContain("Pricing");
    expect(html).toContain("Photos");
    expect(html).toContain("Title &amp; description");
    expect(html).not.toContain("Payment arrangements");
  });

  it("does not carry the Arrival guide, which is the editor's other half", () => {
    // The guide is reached by the halves toggle, so a chip here would be a second,
    // differently shaped door to one room.
    const html = render("photos");
    expect(html).not.toContain("Arrival guide");
    expect(html).not.toContain("/arrival-guide");
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
    expect(render("photos", ["basics", "location"])).toContain("lucide-circle-alert");
  });

  it("shows no flag when nothing is outstanding", () => {
    expect(render("photos", [])).not.toContain("lucide-circle-alert");
  });
});

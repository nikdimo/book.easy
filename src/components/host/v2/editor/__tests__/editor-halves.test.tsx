import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorHalves } from "@/components/host/v2/editor/editor-halves";

/**
 * The regression this file exists for.
 *
 * The Arrival guide once carried the only copy of this toggle, while the way into it from
 * the other side was a row at the bottom of a nine-item rail. That is not a switch — it is
 * a door out of one room with the way back hidden somewhere else. These assertions say the
 * control is on both halves and points the other way on each.
 */
function render(half: "space" | "arrival") {
  return renderToStaticMarkup(
    <EditorHalves listingId="listing-1" half={half}>
      <p data-pane="child" />
    </EditorHalves>,
  );
}

describe("EditorHalves", () => {
  it("shows both halves whichever one you are on", () => {
    for (const half of ["space", "arrival"] as const) {
      const html = render(half);
      expect(html).toContain("Your space");
      expect(html).toContain("Arrival guide");
    }
  });

  it("links to the half you are not on, from either side", () => {
    expect(render("space")).toContain('href="/host/listings/listing-1/arrival-guide"');
    expect(render("arrival")).toContain('href="/host/listings/listing-1"');
  });

  it("does not link the half you are already on", () => {
    // A link back to "Your space" from inside it would throw a host who is three sections
    // deep back to the overview — a navigation that looks like a no-op and is not.
    expect(render("space")).not.toContain('href="/host/listings/listing-1"');
    expect(render("arrival")).not.toContain(
      'href="/host/listings/listing-1/arrival-guide"',
    );
  });

  it("marks the current half for a screen reader", () => {
    expect(render("space")).toContain('aria-current="page"');
    expect(render("arrival")).toContain('aria-current="page"');
  });

  it("renders the half's own content underneath", () => {
    expect(render("space")).toContain('data-pane="child"');
  });
});

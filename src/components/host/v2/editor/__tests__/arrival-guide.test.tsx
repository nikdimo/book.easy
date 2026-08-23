import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ArrivalGuideWorkspace } from "@/components/host/v2/editor/arrival-guide/arrival-guide-workspace";

function render(checkInTime = "15:00", checkOutTime = "11:00") {
  return renderToStaticMarkup(
    <ArrivalGuideWorkspace
      listingId="listing-1"
      checkInTime={checkInTime}
      checkOutTime={checkOutTime}
    />,
  );
}

describe("ArrivalGuideWorkspace", () => {
  it("summarizes the times and sends edits to their single owner", () => {
    const html = render();

    expect(html).toContain("15:00");
    expect(html).toContain("11:00");
    expect(html).toContain('href="/host/listings/listing-1/house-rules"');
    expect(html).toContain("one place to change them");
  });

  it("does not render a second editor for the House rules fields", () => {
    const html = render();

    expect(html).not.toContain("<input");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("<button");
  });

  it("keeps imported minute-level times visible and explains flexible times", () => {
    expect(render("14:15", "")).toContain("14:15");
    expect(render("14:15", "")).toContain("Flexible — agree with the guest");
  });

  it("warns hosts not to put access credentials in public copy", () => {
    const html = render();

    expect(html).toContain("booking chat");
    expect(html).toContain("Never put them in the public listing description");
  });
});

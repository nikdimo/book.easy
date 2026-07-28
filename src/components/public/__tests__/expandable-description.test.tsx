import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExpandableDescription } from "@/components/public/expandable-description";

describe("ExpandableDescription", () => {
  it("keeps the complete description mounted while initially clamping it", () => {
    const text = `${"A long translated description. ".repeat(14)}Final sentence.`;
    const html = renderToStaticMarkup(
      <ExpandableDescription text={text} preservePlaceNames={[]} />
    );

    expect(html).toContain("line-clamp-5");
    expect(html).toContain("Final sentence.");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Show more");
    expect(html).toContain("Show less");
    expect(html).toContain("hidden");
    expect(html).toContain('translate="no"');
  });
});

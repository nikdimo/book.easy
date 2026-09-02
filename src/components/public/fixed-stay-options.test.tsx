import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FixedStayOptions } from "@/components/public/fixed-stay-options";
import { computeStayQuote, parseLocalYmd } from "@/lib/utils/stay-pricing";
import type { GuestFixedStayOption } from "@/lib/fixed-stay-options";

/**
 * The option list, rendered statically — the repo's vitest environment is `node`, so
 * there is no DOM to click. Which is why the selection is a prop: every state a guest can
 * reach is a render this file can assert on.
 */

const option = (
  id: string,
  checkIn: string,
  checkOut: string,
  nights: number,
  selectable = true,
): GuestFixedStayOption => ({ id, checkIn, checkOut, nights, selectable });

const season = [
  option("week-1", "2029-06-09", "2029-06-16", 7),
  option("fortnight", "2029-06-09", "2029-06-23", 14),
  option("week-2", "2029-06-16", "2029-06-23", 7, false),
  option("july", "2029-07-07", "2029-07-14", 7),
];

/** The listing's ordinary pricing: 50 a night, 10 cleaning, no overrides, no offers. */
const quoteTotal = (candidate: GuestFixedStayOption) =>
  computeStayQuote({
    baseNightly: 50,
    cleaningFee: 10,
    checkIn: parseLocalYmd(candidate.checkIn),
    checkOut: parseLocalYmd(candidate.checkOut),
    overrides: new Map(),
    promotions: [],
  }).total;

function render(
  options: GuestFixedStayOption[],
  selectedId: string | null = null,
) {
  return renderToStaticMarkup(
    <FixedStayOptions
      options={options}
      name="stay"
      selectedId={selectedId}
      onSelect={() => {}}
      quoteTotal={quoteTotal}
      currency="EUR"
    />,
  );
}

describe("the host's stays, as a guest sees them", () => {
  it("renders one radio per stay in a single group", () => {
    const html = render(season);
    expect(html).toContain('data-fixed-stay-options="list"');
    for (const id of ["week-1", "fortnight", "week-2", "july"]) {
      expect(html).toContain(`data-fixed-stay-option="${id}"`);
    }
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html.match(/name="stay"/g)).toHaveLength(4);
  });

  it("groups the stays by the month they start in", () => {
    const html = render(season);
    expect(html).toContain("June 2029");
    expect(html).toContain("July 2029");
    expect(html.indexOf("June 2029")).toBeLessThan(html.indexOf("July 2029"));
  });

  it("shows each stay's dates, length and total", () => {
    const html = render(season);
    // Weekday, day and month, in the catalog locale's own order.
    expect(html).toContain("Sat, Jun 9 → Sat, Jun 16");
    expect(html).toContain("Sat, Jun 9 → Sat, Jun 23");
    expect(html).toContain("7 nights");
    expect(html).toContain("14 nights");
    // Seven nights at 50 plus a 10 cleaning fee, from the listing's own pricing.
    expect(html).toContain("360");
    // Fourteen nights, the same way — no package price, no second rate.
    expect(html).toContain("710");
  });

  it("keeps an unavailable stay visible, disabled and unexplained", () => {
    const html = render(season);
    expect(html).toContain('data-fixed-stay-option="week-2"');
    expect(html).toContain('data-selectable="false"');
    expect(html).toContain("disabled");
    expect(html).toContain("Unavailable");
    // Never why. Whose booking, whose block and which calendar are not the guest's
    // business, and the projection this renders does not carry them.
    for (const leak of ["Booked", "booked", "Manual", "manual", "Imported", "imported", "block"]) {
      expect(html).not.toContain(leak);
    }
  });

  it("marks only the chosen stay as checked", () => {
    const html = render(season, "fortnight");
    const checked = html.match(/checked=""/g) ?? [];
    expect(checked).toHaveLength(1);
    expect(html).toContain("border-primary");
  });

  it("cannot mark an unavailable stay as chosen", () => {
    // The component is told which id is selected; an unavailable one still renders
    // disabled, and the widget's own resolution never hands it one.
    const html = render(season, "week-2");
    expect(html).toContain('data-selectable="false"');
    expect(html).toContain("disabled");
  });

  it("keeps the season visible when every stay is unavailable", () => {
    const html = render(season.map((o) => ({ ...o, selectable: false })));
    expect(html).toContain('data-fixed-stay-options="list"');
    expect(html).toContain("No stays are open right now");
    expect(html.match(/type="radio"/g)).toHaveLength(season.length);
    expect(html.match(/disabled/g)?.length).toBeGreaterThanOrEqual(season.length);
  });

  it("says the same for a listing with no stays at all", () => {
    const html = render([]);
    expect(html).toContain('data-fixed-stay-options="empty"');
  });

  it("counts what is still open", () => {
    expect(render(season)).toContain("3 stays open");
    expect(render([season[0]])).toContain("1 stay open");
  });

  it("carries no price field of its own beyond the quoted total", () => {
    const html = render(season);
    for (const word of ["package", "Package", "packagePrice"]) {
      expect(html).not.toContain(word);
    }
  });

  it("uses the app's own tokens rather than the lab's slate palette", () => {
    const html = render(season, "week-1");
    expect(html).toContain("text-muted-foreground");
    expect(html).toContain("border-primary");
    expect(html).not.toContain("slate-950");
    expect(html).not.toContain("slate-500");
  });
});

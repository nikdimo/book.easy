import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "@/lib/i18n/client";
import { buildCalendarFormats } from "@/lib/host/v2/calendar-format";
import { buildListingCalendarIndex } from "@/lib/host/v2/calendar-model";
import { HORIZON_END, TODAY, makeListing, promotion } from "@/lib/host/v2/__tests__/fixtures";

vi.mock("next/navigation", () => ({
  usePathname: () => "/host/calendar",
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { CalendarMonthGrid } from "@/components/host/v2/calendar/calendar-month-grid";

const formats = buildCalendarFormats("en", ["EUR"]);

/**
 * Every word this grid says goes through the catalog — except, until now, the promotion
 * count in each day's accessible name, which was two English literals picked apart by an
 * English `=== 1`. It sat in the one place the raw-copy lint cannot see (a JS expression
 * rather than JSX text or an attribute literal), so it shipped as the only untranslated
 * sentence on an otherwise fully translated screen, and only a screen-reader user ever
 * met it.
 */
function renderGrid(messages: Record<string, string> = {}) {
  const listing = makeListing({
    promotions: [
      // Promotion ranges are end-exclusive, so p1 covers the 12th alone and p2 and p3
      // overlap on the 15th.
      promotion({ id: "p1", startDate: "2026-03-12", endDate: "2026-03-13" }),
      promotion({ id: "p2", startDate: "2026-03-15", endDate: "2026-03-17" }),
      promotion({ id: "p3", startDate: "2026-03-15", endDate: "2026-03-16" }),
    ],
  });

  return renderToStaticMarkup(
    <I18nProvider locale="en" messages={messages}>
      <CalendarMonthGrid
        listing={listing}
        index={buildListingCalendarIndex(listing)}
        formats={formats}
        today={TODAY}
        horizonEnd={HORIZON_END}
        month="2026-03-01"
        selection={null}
        focusedDate={null}
        onFocusDate={() => {}}
        onSelectDate={() => {}}
        onClearSelection={() => {}}
        onMoveFocus={() => {}}
      />
    </I18nProvider>
  );
}

function labelFor(html: string, date: string): string {
  const match = new RegExp(`data-date="${date}"[^>]*aria-label="([^"]*)"`).exec(html);
  // The attributes are emitted in source order, so the label may precede `data-date`.
  return (
    match?.[1] ??
    new RegExp(`aria-label="([^"]*)"[^>]*data-date="${date}"`).exec(html)?.[1] ??
    ""
  );
}

describe("a calendar day's accessible name", () => {
  it("counts one promotion through the catalog's singular", () => {
    expect(labelFor(renderGrid(), "2026-03-12")).toContain("1 promotion");
  });

  it("counts several through the plural", () => {
    expect(labelFor(renderGrid(), "2026-03-15")).toContain("2 promotions");
  });

  it("says nothing about promotions on a date that has none", () => {
    expect(labelFor(renderGrid(), "2026-03-20")).not.toMatch(/promotion/i);
  });

  it("says it in the host's language when the catalog has one", () => {
    // The English words were hardcoded; nothing could have replaced them. These are the
    // CLDR categories `plural` resolves for `en`.
    const html = renderGrid({
      "host.v2.calendar.day.promotions.one": "{n} промоција",
      "host.v2.calendar.day.promotions.other": "{n} промоции",
    });

    expect(labelFor(html, "2026-03-12")).toContain("1 промоција");
    expect(labelFor(html, "2026-03-15")).toContain("2 промоции");
    expect(html).not.toMatch(/aria-label="[^"]*\d promotions?/);
  });
});

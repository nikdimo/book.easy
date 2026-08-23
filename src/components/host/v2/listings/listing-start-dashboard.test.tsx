import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ListingStartDashboard } from "@/components/host/v2/listings/listing-start-dashboard";
import { getTForLocale } from "@/lib/i18n/t";

vi.mock("next/font/google", () => ({
  Fredoka: () => ({ className: "font-wordmark" }),
}));

describe("ListingStartDashboard", () => {
  it("shows a real resumable draft and both creation paths", async () => {
    const t = await getTForLocale("en");
    const html = renderToStaticMarkup(
      <ListingStartDashboard t={t} firstName="Nikola" draft={{ id: "draft-1", title: "Lake House" }} />,
    );

    expect(html).toContain("Welcome back, Nikola");
    expect(html).toContain("Finish your listing");
    expect(html).toContain("Lake House");
    expect(html).toContain('href="/host/start/resume?draft=draft-1"');
    expect(html).toContain('href="/host/start/new"');
    expect(html).toContain('href="/host/start/import"');
    expect(html).toContain('href="/host/start?firstTime=1"');
  });
});

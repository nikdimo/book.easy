import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EDITOR_NAV_ITEMS } from "@/lib/host/v2/editor-sections";

/**
 * Host V2 no longer has a way back into the classic host panel.
 *
 * These are source assertions rather than render assertions on purpose: both menus put
 * their items inside a Radix dropdown, which renders nothing at all until it is opened,
 * so a rendered snapshot would pass no matter what the links said. The thing worth
 * guarding is that the classic hrefs are not written down anywhere in these files.
 */
const ROOT = process.cwd();

function source(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

const HOST_V2_ACCOUNT_MENU = "src/components/host/v2/host-v2-account-menu.tsx";
const SITE_HEADER = "src/components/shared/header.tsx";

/** The classic panel's own routes. `/host/bookings` is deliberately absent: it is
 *  being moved separately and is not this file's claim to make. */
const CLASSIC_ROUTES = [
  "/host/bookings",
  "/host/inbox",
  "/host/v2",
  "/host/panel",
  "/host/panel?version=current",
];

describe("the Host V2 account menu", () => {
  const menu = source(HOST_V2_ACCOUNT_MENU);

  it.each(CLASSIC_ROUTES)("never links to %s", (route) => {
    expect(menu).not.toContain(`href="${route}"`);
  });

  it("has no classic-panel switch left", () => {
    expect(menu).not.toContain("version=current");
    expect(menu).not.toContain("current_host_panel");
  });

  it("keeps the way back to the booking site", () => {
    expect(menu).toContain('href="/"');
    expect(menu).toContain("host.v2.switch_to_booking");
  });

  it("sends Your listings to the V2 listings page", () => {
    expect(menu).toContain('href="/host/listings"');
  });

  it("still reaches the moderation panel, which is not the classic host panel", () => {
    expect(menu).toContain('href="/admin"');
  });
});

describe("the booking site header", () => {
  const header = source(SITE_HEADER);

  it.each(CLASSIC_ROUTES)("never links to %s", (route) => {
    expect(header).not.toContain(`href="${route}"`);
  });

  it("offers one hosting dashboard rather than a version to pick", () => {
    expect(header).not.toContain("version=current");
    expect(header).not.toContain("current_host_panel");
    expect(header).not.toContain("new_host_panel");
    expect(header).toContain("hostingDashboard.text");
  });

  it("sends Your listings to the V2 listings page", () => {
    expect(header).toContain('href="/host/listings"');
  });

  it("leaves the admin panel alone", () => {
    expect(header).toContain('href="/admin"');
  });
});

describe("the editor navigation", () => {
  it("points every entry at a canonical /host route", () => {
    for (const item of EDITOR_NAV_ITEMS) {
      expect(item.href("listing-1")).toMatch(/^\/host\//);
      expect(item.href("listing-1")).not.toContain("/host/v2");
    }
  });

  it("has no classic-editor handoff component left to render", () => {
    expect(() => source("src/components/host/v2/editor/section-placeholder.tsx")).toThrow();
  });
});

describe("the editor's catch-all section route", () => {
  it("404s a slug no section claims, and never offers the classic editor", async () => {
    const { notFound, redirect, page } = await loadCatchAll();

    await expect(page({ params: Promise.resolve({ id: "listing-1", section: "nonsense" }) }))
      .rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("falls back to the listing overview for a declared section with no route yet", async () => {
    const { notFound, redirect, page } = await loadCatchAll();

    await expect(page({ params: Promise.resolve({ id: "listing-1", section: "photos" }) }))
      .rejects.toThrow("NEXT_REDIRECT");
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/host/listings/listing-1");
  });
});

async function loadCatchAll() {
  vi.resetModules();
  const notFound = vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
  const redirect = vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  });
  vi.doMock("next/navigation", () => ({ notFound, redirect }));
  const mod = await import("@/app/(host-editor)/host/v2/listings/[id]/[section]/page");
  return { notFound, redirect, page: mod.default };
}

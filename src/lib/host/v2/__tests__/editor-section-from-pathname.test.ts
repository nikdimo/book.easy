import { describe, expect, it } from "vitest";
import {
  EDITOR_NAV_ITEMS,
  EDITOR_OVERVIEW_SLUG,
  editorSectionFromPathname,
  editorSectionHref,
} from "@/lib/host/v2/editor-sections";

/**
 * The editor header's listing switcher reads the current section from the pathname so
 * that changing property keeps the host on the page they were reading.
 *
 * It used to take `pathname.split("/")[5]`, which is the slug only on the internal
 * `/host/v2/listings/<id>/<slug>` route. The public route is `/host/listings/<id>/<slug>`
 * — one segment shorter — so the index was always `undefined` and the `?? overview`
 * fallback always won: the switcher silently sent every host to the other listing's
 * Overview, which is precisely what the comment above it said it would not do.
 */
describe("editorSectionFromPathname", () => {
  it("reads the section from the public route the browser actually shows", () => {
    expect(editorSectionFromPathname("/host/listings/listing-1/photos")).toBe("photos");
    expect(editorSectionFromPathname("/host/listings/listing-1/payment-arrangements")).toBe(
      "payment-arrangements",
    );
  });

  it("reads it from the internal rewrite destination too", () => {
    // `next.config.ts` rewrites `/host/listings/:id/:section` to the `/host/v2` route
    // files, so which of the two `usePathname` returns depends on render timing. Neither
    // may change the answer.
    expect(editorSectionFromPathname("/host/v2/listings/listing-1/photos")).toBe("photos");
  });

  it("is Overview on the base route, which has no section segment", () => {
    expect(editorSectionFromPathname("/host/listings/listing-1")).toBe(
      EDITOR_OVERVIEW_SLUG,
    );
    expect(editorSectionFromPathname("/host/v2/listings/listing-1")).toBe(
      EDITOR_OVERVIEW_SLUG,
    );
  });

  it("is Overview for a slug no section claims, rather than a link to a 404", () => {
    // The switcher builds an href from this, and the catch-all route `notFound()`s an
    // unknown slug — so carrying one across to another listing would strand the host.
    expect(editorSectionFromPathname("/host/listings/listing-1/nonsense")).toBe(
      EDITOR_OVERVIEW_SLUG,
    );
  });

  it("is Overview for a path that is not the editor at all", () => {
    expect(editorSectionFromPathname("/host/calendar")).toBe(EDITOR_OVERVIEW_SLUG);
    expect(editorSectionFromPathname("/")).toBe(EDITOR_OVERVIEW_SLUG);
  });

  it("round-trips every section the navigation offers", () => {
    for (const item of EDITOR_NAV_ITEMS) {
      expect(editorSectionFromPathname(editorSectionHref("listing-1", item.slug))).toBe(
        item.slug,
      );
    }
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  archiveListing: vi.fn(),
  unarchiveListing: vi.fn(),
  deleteListing: vi.fn(),
  submitForReview: vi.fn(),
  unpublishListing: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/actions/listing.actions", () => ({
  archiveListing: mocks.archiveListing,
  unarchiveListing: mocks.unarchiveListing,
  deleteListing: mocks.deleteListing,
  submitForReview: mocks.submitForReview,
  unpublishListing: mocks.unpublishListing,
}));

import {
  ListingActionsMenu,
  listingEditHref,
} from "@/components/host/v2/listings/listing-actions-menu";
const listingTitle = "Seaside apartment";

// G2: archive/unarchive/delete now call router.refresh() after a successful mutation so
// the /host/listings overview reflects the new status without a manual reload. The
// menu's dropdown content is a closed Radix portal until opened, so a static render can
// only exercise the trigger — the action wiring itself is covered at the action layer in
// listing.actions.test.ts (revalidatePath now includes "/host/listings").
describe("ListingActionsMenu", () => {
  it("renders the actions trigger for a live listing without throwing", () => {
    const html = renderToStaticMarkup(
      <ListingActionsMenu
        listingId="listing-1"
        slug="seaside-apartment"
        title={listingTitle}
        status="APPROVED"
      />
    );

    expect(html).toContain("Actions for Seaside apartment");
    expect(html).toContain('data-state="closed"');
  });

  // The plain "Edit" item used to open the classic editor at /host/listings/{id}/edit,
  // which dropped the host out of V2 even though the row click next to it opens the V2
  // editor. Radix keeps the menu content in a closed portal, and there is no DOM
  // environment here to open it, so the href is asserted through the builder the item
  // renders. The classic editor keeps its own item, labelled as such, in the editor.
  it("sends the menu's Edit action to the V2 editor, not the classic one", () => {
    expect(listingEditHref("listing-1")).toBe("/host/listings/listing-1");
    expect(listingEditHref("listing-1")).not.toContain("/host/v2");
    expect(listingEditHref("listing-1")).not.toContain("/edit");
  });

  it("renders the actions trigger for an archived listing without throwing", () => {
    const html = renderToStaticMarkup(
      <ListingActionsMenu
        listingId="listing-1"
        slug="seaside-apartment"
        title={listingTitle}
        status="ARCHIVED"
      />
    );

    expect(html).toContain("Actions for Seaside apartment");
  });
});

/**
 * The grid tile pins this button to the corner of the photo by passing `absolute`.
 *
 * The trigger's own classes start with `relative z-10`, and they used to be joined to
 * the caller's with a template string. Tailwind emits `.absolute` before `.relative`, so
 * with equal specificity the later `.relative` won and the button dropped back into the
 * flow at the top left of the tile, over the status pill, instead of pinning to the top
 * right. `twMerge` resolves the conflict by dropping the loser rather than stacking both.
 */
describe("the trigger's position when a caller places it", () => {
  function triggerClasses(className?: string): string {
    const html = renderToStaticMarkup(
      <ListingActionsMenu
        listingId="listing-1"
        slug="seaside-apartment"
        title={listingTitle}
        status="APPROVED"
        className={className}
      />
    );
    return /<button[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
  }

  it("takes the caller's `absolute` and drops its own `relative`", () => {
    const classes = triggerClasses("absolute right-2 top-2 bg-white/95").split(/\s+/);

    expect(classes).toContain("absolute");
    expect(classes).not.toContain("relative");
    // The offsets are only meaningful against the tile, so they have to survive too.
    expect(classes).toContain("right-2");
    expect(classes).toContain("top-2");
  });

  it("keeps `relative` when no caller overrides it", () => {
    const classes = triggerClasses().split(/\s+/);

    expect(classes).toContain("relative");
    expect(classes).not.toContain("absolute");
    // `z-10` is what lifts the button above the row link's full-row `::after` overlay.
    expect(classes).toContain("z-10");
  });
});

/**
 * Publishing had one home in the whole panel — the switch on a listings row, hidden
 * below `sm` and never rendered in the grid — so a phone host could not take a listing
 * off the site at all. This menu is the one control present at every width and in both
 * views, so it names the same action.
 *
 * Radix keeps menu content in a closed portal and there is no DOM here to open it, so
 * these are source assertions, like `classic-panel-links.test.ts`. The behaviour behind
 * them is covered in `listing-visibility.test.tsx`.
 */
describe("the visibility item", () => {
  const source = readFileSync(
    path.join(process.cwd(), "src/components/host/v2/listings/listing-actions-menu.tsx"),
    "utf8",
  );

  it("offers publishing from the menu, using the shared rules", () => {
    expect(source).toContain("useListingVisibility");
    expect(source).toContain("isVisibilitySwitchable(status)");
    expect(source).toContain("visibility.actionLabel");
  });

  it("asks before taking a live listing down, and does not ask to put one up", () => {
    expect(source).toContain(
      "visibility.isPublished ? visibility.requestHide : visibility.publish",
    );
  });

  it("renders the confirmation outside the menu that would unmount it", () => {
    const menuEnd = source.indexOf("</DropdownMenu>");
    expect(source.indexOf("<ListingHideDialog")).toBeGreaterThan(menuEnd);
  });
});

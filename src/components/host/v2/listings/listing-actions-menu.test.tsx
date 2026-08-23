import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  archiveListing: vi.fn(),
  unarchiveListing: vi.fn(),
  deleteListing: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/actions/listing.actions", () => ({
  archiveListing: mocks.archiveListing,
  unarchiveListing: mocks.unarchiveListing,
  deleteListing: mocks.deleteListing,
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

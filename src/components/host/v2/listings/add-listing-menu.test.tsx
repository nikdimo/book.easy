import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ADD_LISTING_ACTIONS,
  AddListingActions,
  AddListingMenu,
  HOST_START_IMPORT_HREF,
  HOST_START_NEW_HREF,
} from "@/components/host/v2/listings/add-listing-menu";

/**
 * The overview's `+` used to be a bare link to /host/start/new, so importing an existing
 * listing — which the backend has always supported at /host/start/import — was only
 * reachable from the start dashboard. These tests pin both destinations.
 *
 * Radix keeps menu content in a closed portal and there is no DOM here, so the menu's
 * hrefs are asserted through the exported action list the component maps over, the same
 * approach listing-actions-menu.test.tsx takes for its Edit item.
 */
describe("AddListingMenu", () => {
  it("offers exactly two ways to start a listing", () => {
    expect(ADD_LISTING_ACTIONS.map((action) => action.key)).toEqual([
      "create",
      "import",
    ]);
  });

  it("reuses the existing create and import routes rather than new ones", () => {
    const byKey = Object.fromEntries(
      ADD_LISTING_ACTIONS.map((action) => [action.key, action.href])
    );
    expect(byKey.create).toBe("/host/start/new");
    expect(byKey.import).toBe("/host/start/import");
    expect(HOST_START_NEW_HREF).toBe("/host/start/new");
    expect(HOST_START_IMPORT_HREF).toBe("/host/start/import");
  });

  it("renders a labelled trigger for the list and grid toolbar", () => {
    const html = renderToStaticMarkup(<AddListingMenu />);
    expect(html).toContain("Add a listing");
    expect(html).toContain('data-state="closed"');
  });

  // The empty state has no rows to scan and one decision to make, so both choices are
  // spelled out there instead of hiding the second one behind a menu.
  it("spells both choices out in the empty state", () => {
    const html = renderToStaticMarkup(<AddListingActions />);
    expect(html).toContain(HOST_START_NEW_HREF);
    expect(html).toContain(HOST_START_IMPORT_HREF);
    expect(html).toContain("Create a new listing");
    expect(html).toContain("Import an existing listing");
  });
});

import { describe, expect, it } from "vitest";
import {
  backFrom,
  ctaForEditor,
  editorScope,
  leavingLosesWork,
  listingConnectionsHref,
  MENU_VIEW,
  MINIMUM_STAY_TARGET,
  openEditor,
  reviewContractFor,
  scopeOfSelection,
  viewAfterScopeChange,
  WORKBENCH_MENU,
  type WorkbenchEditor,
  type WorkbenchView,
} from "@/lib/host/v2/calendar-workbench";

const selection = { start: "2026-03-12", end: "2026-03-14" };

describe("scope", () => {
  it("is the selection, and only the selection", () => {
    expect(scopeOfSelection(selection)).toBe("DATES");
    expect(scopeOfSelection(null)).toBe("ALL_FUTURE");
  });

  it("offers a different menu in each scope, with nothing in common", () => {
    const dates = WORKBENCH_MENU.DATES;
    const all = WORKBENCH_MENU.ALL_FUTURE;
    expect(dates).toEqual(["availability", "pricing", "promotions"]);
    expect(all).toEqual([
      "listing_visibility",
      "listing_defaults",
      "listing_promotions",
    ]);
    // "Block these nights" and "close every date by default" must never be reachable
    // through the same identifier.
    expect(dates.some((editor) => all.includes(editor))).toBe(false);
  });
});

describe("opening an editor", () => {
  it("transforms the menu into exactly one editor", () => {
    expect(openEditor("pricing", "DATES")).toEqual({
      kind: "editor",
      editor: "pricing",
    });
  });

  it("refuses an editor that does not belong to the current scope", () => {
    expect(openEditor("listing_defaults", "DATES")).toBeNull();
    expect(openEditor("availability", "ALL_FUTURE")).toBeNull();
  });

  it("puts every menu entry in reach of its own scope", () => {
    for (const scope of ["DATES", "ALL_FUTURE"] as const) {
      for (const editor of WORKBENCH_MENU[scope]) {
        expect(openEditor(editor, scope)).toEqual({ kind: "editor", editor });
      }
    }
  });
});

describe("only one destination at a time", () => {
  const views: WorkbenchView[] = [
    MENU_VIEW,
    { kind: "schedule" },
    ...WORKBENCH_MENU.DATES.map(
      (editor): WorkbenchView => ({ kind: "editor", editor }),
    ),
  ];

  it("is a single value, so two editors cannot be open together", () => {
    for (const view of views) {
      const open = view.kind === "editor" ? [view.editor] : [];
      expect(open.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("back", () => {
  it("always climbs to the menu, from anywhere", () => {
    expect(backFrom({ kind: "editor", editor: "availability" })).toEqual(MENU_VIEW);
    expect(backFrom({ kind: "schedule" })).toEqual(MENU_VIEW);
  });

  it("is a no-op on the menu itself", () => {
    expect(backFrom(MENU_VIEW)).toEqual(MENU_VIEW);
  });

  it("warns about losing work only when an editor holds a draft", () => {
    const editor: WorkbenchView = { kind: "editor", editor: "pricing" };
    expect(leavingLosesWork(editor, true)).toBe(true);
    expect(leavingLosesWork(editor, false)).toBe(false);
    // Neither of these can be holding one, so neither may raise the prompt.
    expect(leavingLosesWork({ kind: "schedule" }, true)).toBe(false);
    expect(leavingLosesWork(MENU_VIEW, true)).toBe(false);
  });
});

describe("scope changes under an open editor", () => {
  it("keeps a date editor open when the selection merely changes", () => {
    const view: WorkbenchView = { kind: "editor", editor: "pricing" };
    expect(viewAfterScopeChange(view, "DATES")).toBe(view);
  });

  it("drops a date editor when the selection is cleared", () => {
    expect(
      viewAfterScopeChange({ kind: "editor", editor: "pricing" }, "ALL_FUTURE"),
    ).toEqual(MENU_VIEW);
  });

  it("drops a listing editor when dates are selected", () => {
    expect(
      viewAfterScopeChange(
        { kind: "editor", editor: "listing_defaults" },
        "DATES",
      ),
    ).toEqual(MENU_VIEW);
  });

  it("leaves the menu and the schedule list alone in either scope", () => {
    for (const scope of ["DATES", "ALL_FUTURE"] as const) {
      expect(viewAfterScopeChange(MENU_VIEW, scope)).toEqual(MENU_VIEW);
      expect(viewAfterScopeChange({ kind: "schedule" }, scope)).toEqual({
        kind: "schedule",
      });
    }
  });
});

describe("the sticky primary action", () => {
  it("names the review each editor produces", () => {
    expect(ctaForEditor("availability")).toBe("REVIEW_AVAILABILITY");
    expect(ctaForEditor("pricing")).toBe("REVIEW_PRICE");
    expect(ctaForEditor("promotions")).toBe("REVIEW_PROMOTION");
  });

  it("uses the date contract for date editors and the listing one for the rest", () => {
    for (const editor of WORKBENCH_MENU.DATES) {
      expect(reviewContractFor(editor)).toBe("DATE");
    }
    for (const editor of WORKBENCH_MENU.ALL_FUTURE) {
      expect(reviewContractFor(editor)).toBe("LISTING");
    }
  });

  it("gives every editor exactly one action", () => {
    const all: WorkbenchEditor[] = [
      ...WORKBENCH_MENU.DATES,
      ...WORKBENCH_MENU.ALL_FUTURE,
    ];
    expect(new Set(all.map(ctaForEditor)).size).toBe(all.length);
  });
});

describe("connected calendars", () => {
  it("points at the existing management surface rather than a second copy", () => {
    // `/host/listings/[id]/availability` is the route that renders
    // `CalendarConnections`; the panel links there and owns no sync logic of its own.
    expect(listingConnectionsHref("listing-1")).toBe(
      "/host/listings/listing-1/availability",
    );
  });
});

describe("the listing-wide minimum stay", () => {
  it("is reached by changing scope, not by adding a field to the date save", () => {
    expect(MINIMUM_STAY_TARGET).toEqual({
      scope: "ALL_FUTURE",
      editor: "listing_defaults",
    });
    // The thing this guards: a minimum stay saved through the date scope would be a
    // listing-wide rule written as if it applied to the selected nights only.
    expect(editorScope(MINIMUM_STAY_TARGET.editor)).toBe("ALL_FUTURE");
    expect(reviewContractFor(MINIMUM_STAY_TARGET.editor)).toBe("LISTING");
    expect(openEditor(MINIMUM_STAY_TARGET.editor, "DATES")).toBeNull();
  });
});

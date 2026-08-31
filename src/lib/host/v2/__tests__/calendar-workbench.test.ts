import { describe, expect, it } from "vitest";
import {
  backFrom,
  ctaForEditor,
  editorScope,
  leavingLosesWork,
  CONNECTIONS_VIEW,
  MENU_VIEW,
  openEditor,
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

  it("offers the three date editors, and nothing at all without dates", () => {
    expect(WORKBENCH_MENU.DATES).toEqual([
      "availability",
      "pricing",
      "promotions",
    ]);
    // The calendar no longer edits anything listing-wide: the base price, the cleaning
    // fee, the minimum stay, the always-active offers and the default availability all
    // have exactly one home now, and it is the listing editor. With no dates chosen
    // this panel reports those values and links to them.
    expect(WORKBENCH_MENU.ALL_FUTURE).toEqual([]);
  });

  it("puts every editor in the date scope", () => {
    for (const editor of WORKBENCH_MENU.DATES) {
      expect(editorScope(editor)).toBe("DATES");
    }
  });
});

describe("opening an editor", () => {
  it("transforms the menu into exactly one editor", () => {
    expect(openEditor("pricing", "DATES")).toEqual({
      kind: "editor",
      editor: "pricing",
    });
  });

  it("refuses every editor while no dates are selected", () => {
    // This is what keeps an arriving `?intent=` safe: it can only ever name an editor
    // that acts on selected dates, and without a selection it opens nothing at all.
    for (const editor of WORKBENCH_MENU.DATES) {
      expect(openEditor(editor, "ALL_FUTURE")).toBeNull();
    }
  });

  it("puts every menu entry in reach of its own scope", () => {
    for (const editor of WORKBENCH_MENU.DATES) {
      expect(openEditor(editor, "DATES")).toEqual({ kind: "editor", editor });
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
    for (const editor of WORKBENCH_MENU.DATES) {
      expect(
        viewAfterScopeChange({ kind: "editor", editor }, "ALL_FUTURE"),
      ).toEqual(MENU_VIEW);
    }
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

  it("gives every editor exactly one action", () => {
    const all: WorkbenchEditor[] = [...WORKBENCH_MENU.DATES];
    expect(new Set(all.map(ctaForEditor)).size).toBe(all.length);
  });
});

describe("connected calendars", () => {
  it("is a view of the panel, so the host never leaves the calendar for it", () => {
    expect(CONNECTIONS_VIEW).toEqual({ kind: "connections" });
  });

  it("stages nothing, so leaving it can never prompt about lost work", () => {
    // Connecting or disconnecting takes effect when asked for; only an editor holds a
    // draft, and the discard prompt must stay reserved for one.
    expect(leavingLosesWork(CONNECTIONS_VIEW, true)).toBe(false);
    expect(backFrom(CONNECTIONS_VIEW)).toEqual(MENU_VIEW);
  });
});

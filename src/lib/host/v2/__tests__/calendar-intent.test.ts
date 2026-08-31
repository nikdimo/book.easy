import { describe, expect, it } from "vitest";
import {
  calendarArrival,
  EDITOR_FOR_INTENT,
  viewForPendingIntent,
} from "@/lib/host/v2/calendar-intent";
import { MENU_VIEW, WORKBENCH_MENU } from "@/lib/host/v2/calendar-workbench";
import { CALENDAR_INTENTS } from "@/lib/host/v2/calendar-href";
import { clampSelectionToHorizon } from "@/lib/host/v2/calendar-selection";

const TODAY = "2026-03-10";
const HORIZON_END = "2027-09-10";

function arrive(overrides: Partial<Parameters<typeof calendarArrival>[0]> = {}) {
  return calendarArrival({
    intent: null,
    range: null,
    hasListing: true,
    today: TODAY,
    horizonEnd: HORIZON_END,
    ...overrides,
  });
}

describe("what an intent can open", () => {
  it("maps every intent to an editor that only ever acts on selected dates", () => {
    for (const intent of CALENDAR_INTENTS) {
      const editor = EDITOR_FOR_INTENT[intent];
      expect(WORKBENCH_MENU.DATES).toContain(editor);
    }
  });

  it("names one editor each, with nothing shared", () => {
    expect(EDITOR_FOR_INTENT).toEqual({
      availability: "availability",
      pricing: "pricing",
      promotion: "promotions",
    });
  });
});

describe("arriving without an intent", () => {
  it("lands on the menu with nothing pending", () => {
    expect(arrive()).toEqual({
      selection: null,
      view: MENU_VIEW,
      pendingIntent: null,
    });
  });

  it("still honours a range the link carried", () => {
    const arrival = arrive({ range: { from: "2026-07-01", to: "2026-07-05" } });
    expect(arrival.selection).toEqual({ start: "2026-07-01", end: "2026-07-05" });
    expect(arrival.view).toEqual(MENU_VIEW);
  });
});

describe("arriving with an intent and no dates", () => {
  it("holds the intent and asks for dates rather than opening an editor", () => {
    for (const intent of CALENDAR_INTENTS) {
      const arrival = arrive({ intent });
      expect(arrival.selection).toBeNull();
      // The prompt state: the panel says what it is waiting for, and no editor is
      // open over dates that do not exist.
      expect(arrival.view).toEqual(MENU_VIEW);
      expect(arrival.pendingIntent).toBe(intent);
    }
  });

  it("drops the intent entirely when no listing was resolved", () => {
    // Without a property the calendar shows the portfolio overview, which has no grid
    // to select in — an intent there could never be answered.
    const arrival = arrive({ intent: "pricing", hasListing: false });
    expect(arrival.pendingIntent).toBeNull();
    expect(arrival.view).toEqual(MENU_VIEW);
  });

  it("drops a range that came without a listing", () => {
    const arrival = arrive({
      intent: "promotion",
      hasListing: false,
      range: { from: "2026-07-01", to: "2026-07-05" },
    });
    expect(arrival.selection).toBeNull();
  });
});

describe("arriving with an intent and its dates", () => {
  it("opens the matching editor immediately, with nothing left pending", () => {
    const arrival = arrive({
      intent: "promotion",
      range: { from: "2026-07-01", to: "2026-07-14" },
    });
    expect(arrival.selection).toEqual({ start: "2026-07-01", end: "2026-07-14" });
    expect(arrival.view).toEqual({ kind: "editor", editor: "promotions" });
    expect(arrival.pendingIntent).toBeNull();
  });

  it("clamps a range that starts in the past", () => {
    const arrival = arrive({
      intent: "pricing",
      range: { from: "2025-01-01", to: "2026-03-12" },
    });
    expect(arrival.selection).toEqual({ start: TODAY, end: "2026-03-12" });
    expect(arrival.view).toEqual({ kind: "editor", editor: "pricing" });
  });

  it("asks again when a stale range has nothing left inside the horizon", () => {
    const arrival = arrive({
      intent: "pricing",
      range: { from: "2024-01-01", to: "2024-02-01" },
    });
    expect(arrival.selection).toBeNull();
    expect(arrival.view).toEqual(MENU_VIEW);
    expect(arrival.pendingIntent).toBe("pricing");
  });
});

describe("the first selection after arriving", () => {
  it("opens the editor the intent named", () => {
    expect(
      viewForPendingIntent("availability", { start: "2026-04-01", end: "2026-04-03" }),
    ).toEqual({ kind: "editor", editor: "availability" });
  });

  it("does nothing without an intent, and nothing without dates", () => {
    expect(
      viewForPendingIntent(null, { start: "2026-04-01", end: "2026-04-03" }),
    ).toBeNull();
    // Clearing the selection is not an answer, so the intent stays pending and the
    // prompt comes back rather than an editor opening over nothing.
    expect(viewForPendingIntent("pricing", null)).toBeNull();
  });
});

describe("clampSelectionToHorizon", () => {
  it("keeps a range that is entirely inside the horizon", () => {
    expect(
      clampSelectionToHorizon(
        { start: "2026-05-01", end: "2026-05-04" },
        TODAY,
        HORIZON_END,
      ),
    ).toEqual({ start: "2026-05-01", end: "2026-05-04" });
  });

  it("trims to today and to the last rendered date", () => {
    // `horizonEnd` is exclusive everywhere else here, so the last selectable date is
    // the day before it.
    expect(
      clampSelectionToHorizon(
        { start: "2020-01-01", end: "2030-01-01" },
        TODAY,
        HORIZON_END,
      ),
    ).toEqual({ start: TODAY, end: "2027-09-09" });
  });

  it("returns nothing when the range and the horizon do not overlap", () => {
    expect(
      clampSelectionToHorizon(
        { start: "2020-01-01", end: "2020-02-01" },
        TODAY,
        HORIZON_END,
      ),
    ).toBeNull();
    expect(
      clampSelectionToHorizon(
        { start: "2030-01-01", end: "2030-02-01" },
        TODAY,
        HORIZON_END,
      ),
    ).toBeNull();
  });
});

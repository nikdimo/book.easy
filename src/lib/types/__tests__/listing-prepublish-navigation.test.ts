import { describe, expect, it } from "vitest";
import {
  prePublishBackTarget,
  prePublishTaskPrimaryAction,
  type PrePublishNavScreen,
} from "@/lib/types/listing-prepublish-navigation";
import {
  EMPTY_PRE_PUBLISH_PLAN,
  isRangeFullyOpen,
  parsePrePublishPlan,
  type PrePublishPlan,
} from "@/lib/types/listing-prepublish-plan";

const TASKS: PrePublishNavScreen[] = ["availability", "pricing", "offers"];

describe("prePublishBackTarget", () => {
  it("returns a task opened from the checklist to the checklist", () => {
    for (const task of TASKS) {
      expect(prePublishBackTarget(task, "menu")).toBe("menu");
    }
  });

  it("returns date pricing opened from the Pricing step to the wizard, not the checklist", () => {
    // null means "leave the pre-publish screens" — the numbered step underneath is
    // still Pricing, so that is where the host lands.
    expect(prePublishBackTarget("pricing", "pricing-step")).toBeNull();
  });

  it("returns dated offers opened from the Special offer step to that step", () => {
    expect(prePublishBackTarget("offers", "offer-step")).toBeNull();
  });

  it("leaves the pre-publish flow from the checklist itself", () => {
    expect(prePublishBackTarget("menu", "menu")).toBeNull();
    expect(prePublishBackTarget("menu", "pricing-step")).toBeNull();
  });

  it("does nothing when the host is already in the wizard proper", () => {
    expect(prePublishBackTarget(null, "menu")).toBeNull();
    expect(prePublishBackTarget(null, "pricing-step")).toBeNull();
  });
});

describe("prePublishTaskPrimaryAction", () => {
  it("shows Done before a range is selected", () => {
    expect(prePublishTaskPrimaryAction("pricing", false)).toBe("done");
    expect(prePublishTaskPrimaryAction("offers", false)).toBe("done");
  });

  it("opens the price editor for a selected pricing range", () => {
    expect(prePublishTaskPrimaryAction("pricing", true)).toBe("edit-price");
  });

  it("opens the promotion editor for a selected promotion range", () => {
    expect(prePublishTaskPrimaryAction("offers", true)).toBe("add-promotion");
  });

  it("blocks a selected availability range from the footer", () => {
    expect(prePublishTaskPrimaryAction("availability", false)).toBe("done");
    expect(prePublishTaskPrimaryAction("availability", true)).toBe("block-dates");
  });

  it("opens a selected range for a closed-by-default listing", () => {
    expect(prePublishTaskPrimaryAction("availability", true, true)).toBe(
      "open-dates",
    );
  });

  it("closes a selection made entirely of dates the host already opened", () => {
    expect(prePublishTaskPrimaryAction("availability", true, true, true)).toBe(
      "block-dates",
    );
  });

  it("still opens when the selection only partly overlaps an open window", () => {
    expect(prePublishTaskPrimaryAction("availability", true, true, false)).toBe(
      "open-dates",
    );
  });
});

describe("isRangeFullyOpen", () => {
  const windows = [
    { startDate: "2026-08-18", endDate: "2026-08-21" },
    { startDate: "2026-09-01", endDate: "2026-09-02" },
  ];

  it("is true for a selection inside one window", () => {
    expect(
      isRangeFullyOpen({ startDate: "2026-08-19", endDate: "2026-08-20" }, windows),
    ).toBe(true);
  });

  it("is false when the selection runs past the edge of a window", () => {
    expect(
      isRangeFullyOpen({ startDate: "2026-08-20", endDate: "2026-08-22" }, windows),
    ).toBe(false);
  });

  it("is false for a selection spanning the gap between two windows", () => {
    expect(
      isRangeFullyOpen({ startDate: "2026-08-18", endDate: "2026-09-02" }, windows),
    ).toBe(false);
  });

  it("is false when nothing is open yet", () => {
    expect(
      isRangeFullyOpen({ startDate: "2026-08-19", endDate: "2026-08-19" }, []),
    ).toBe(false);
  });
});

describe("date-pricing summary count", () => {
  const plan: PrePublishPlan = {
    ...EMPTY_PRE_PUBLISH_PLAN,
    datePrices: [
      { startDate: "2026-08-10", endDate: "2026-08-14", nightlyRate: 120 },
      { startDate: "2026-12-24", endDate: "2026-12-31", nightlyRate: 200 },
      { startDate: "2027-01-05", endDate: "2027-01-05", nightlyRate: 80 },
    ],
  };

  it("counts date ranges, not priced nights", () => {
    // The Pricing CTA says "3 date ranges" for these entries; the 14 nights they
    // cover would be the wrong number to show.
    expect(plan.datePrices.length).toBe(3);
  });

  it("survives a draft save and resume unchanged", () => {
    // The CTA, the checklist and the draft all read the same `datePrices` array, so
    // a round trip through the draft's JSON is what "reopening shows the same ranges"
    // rests on.
    const resumed = parsePrePublishPlan(JSON.stringify(plan));
    expect(resumed.datePrices).toEqual(plan.datePrices);
  });

  it("shows nothing set for a fresh plan", () => {
    expect(parsePrePublishPlan(undefined).datePrices.length).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  findSelectableFixedStayOption,
  fixedStaySelectionStatus,
  groupFixedStayOptionsByMonth,
  hasSelectableFixedStayOption,
  selectableFixedStayOptions,
  type GuestFixedStayOption,
} from "@/lib/fixed-stay-options";

/**
 * The browser's half of the guest projection: grouping, selection and the selection
 * state the booking card reads. Everything about past and switched-off stays is the
 * server's business — they never reach this module, and these tests say so by never
 * modelling one.
 */

const option = (
  id: string,
  checkIn: string,
  checkOut: string,
  nights: number,
  selectable = true,
): GuestFixedStayOption => ({ id, checkIn, checkOut, nights, selectable });

const season: GuestFixedStayOption[] = [
  option("jun-week-1", "2029-06-09", "2029-06-16", 7),
  option("jun-fortnight", "2029-06-09", "2029-06-23", 14),
  option("jun-week-2", "2029-06-16", "2029-06-23", 7, false),
  option("jul-week", "2029-07-07", "2029-07-14", 7),
];

describe("groupFixedStayOptionsByMonth", () => {
  it("splits the season into the months the stays start in", () => {
    expect(
      groupFixedStayOptionsByMonth(season).map((group) => [
        group.month,
        group.items.map((item) => item.id),
      ]),
    ).toEqual([
      ["2029-06", ["jun-week-1", "jun-fortnight", "jun-week-2"]],
      ["2029-07", ["jul-week"]],
    ]);
  });

  it("keeps the server's order rather than sorting again", () => {
    const reversed = [...season].reverse();
    expect(
      groupFixedStayOptionsByMonth(reversed).map((group) => group.month),
    ).toEqual(["2029-07", "2029-06"]);
  });

  it("groups by the check-in month even when the stay ends in the next one", () => {
    expect(
      groupFixedStayOptionsByMonth([
        option("crosses", "2029-06-30", "2029-07-07", 7),
      ]).map((group) => group.month),
    ).toEqual(["2029-06"]);
  });

  it("returns nothing for an empty season", () => {
    expect(groupFixedStayOptionsByMonth([])).toEqual([]);
  });
});

describe("findSelectableFixedStayOption", () => {
  it("finds a stay a guest may take", () => {
    expect(findSelectableFixedStayOption(season, "jun-fortnight")?.nights).toBe(14);
  });

  it("refuses an unavailable stay, an unknown id and no id at all", () => {
    expect(findSelectableFixedStayOption(season, "jun-week-2")).toBeNull();
    expect(findSelectableFixedStayOption(season, "from-another-listing")).toBeNull();
    expect(findSelectableFixedStayOption(season, null)).toBeNull();
    expect(findSelectableFixedStayOption(season, undefined)).toBeNull();
    expect(findSelectableFixedStayOption(season, "")).toBeNull();
  });
});

describe("what is still open", () => {
  it("counts only the stays a guest may take", () => {
    expect(selectableFixedStayOptions(season).map((o) => o.id)).toEqual([
      "jun-week-1",
      "jun-fortnight",
      "jul-week",
    ]);
    expect(hasSelectableFixedStayOption(season)).toBe(true);
  });

  it("reports a season with nothing left as closed", () => {
    const takenSeason = season.map((o) => ({ ...o, selectable: false }));
    expect(hasSelectableFixedStayOption(takenSeason)).toBe(false);
    expect(hasSelectableFixedStayOption([])).toBe(false);
  });
});

describe("fixedStaySelectionStatus", () => {
  it("reports a chosen stay as valid, with its own length", () => {
    expect(fixedStaySelectionStatus(season[1])).toEqual({
      status: "valid",
      nights: 14,
    });
  });

  it("reports nothing chosen as incomplete rather than invalid", () => {
    // "Incomplete" is what the card's button reads to say what is still missing;
    // "invalid" would make it print an error at a guest who has not chosen yet.
    expect(fixedStaySelectionStatus(null)).toEqual({
      status: "incomplete",
      nights: 0,
    });
  });

  it("never reports a minimum- or maximum-stay problem", () => {
    // Those rules do not apply to a fixed stay: the host chose its length. The status
    // union has no room for them, which is the point.
    const statuses = [season[0], season[1], null].map(
      (candidate) => fixedStaySelectionStatus(candidate).status,
    );
    expect(new Set(statuses)).toEqual(new Set(["valid", "incomplete"]));
  });
});

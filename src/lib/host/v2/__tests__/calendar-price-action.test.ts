import { describe, expect, it } from "vitest";
import { buildListingCalendarIndex } from "@/lib/host/v2/calendar-model";
import {
  buildPriceAction,
  percentFromPrice,
  priceFromPercent,
  stepsForBasePrice,
  stepsForPrice,
  undoStepsForPrices,
} from "@/lib/host/v2/calendar-price-action";
import { makeListing } from "./fixtures";

describe("priceFromPercent", () => {
  it("rounds to whole currency units", () => {
    expect(priceFromPercent(187, -15)).toBe(159);
    expect(priceFromPercent(180, 15)).toBe(207);
    expect(priceFromPercent(180, 0)).toBe(180);
  });

  it("never resolves below the lowest price the service accepts", () => {
    expect(priceFromPercent(1, -30)).toBe(1);
  });
});

describe("percentFromPrice", () => {
  it("reads a price back as a whole percentage", () => {
    expect(percentFromPrice(180, 207)).toBe(15);
    expect(percentFromPrice(180, 153)).toBe(-15);
    expect(percentFromPrice(180, 180)).toBe(0);
  });

  it("reports a price beyond the slider's reach truthfully", () => {
    expect(percentFromPrice(180, 540)).toBe(200);
  });

  it("refuses to divide by a base of zero", () => {
    expect(percentFromPrice(0, 120)).toBe(0);
  });
});

describe("buildPriceAction", () => {
  it("reports the spread and how many dates carry their own price", () => {
    const listing = makeListing({
      datePrices: [
        { date: "2026-03-12", nightlyRate: 200 },
        { date: "2026-03-13", nightlyRate: 90 },
      ],
    });
    const index = buildListingCalendarIndex(listing);
    const model = buildPriceAction({
      listing,
      index,
      dates: ["2026-03-11", "2026-03-12", "2026-03-13"],
    });

    expect(model).not.toBeNull();
    expect(model?.base).toBe(120);
    expect(model?.min).toBe(90);
    expect(model?.max).toBe(200);
    expect(model?.mixed).toBe(true);
    expect(model?.customCount).toBe(2);
  });

  it("is null for a listing with no pricing rule to price against", () => {
    const listing = makeListing({ pricing: null });
    const index = buildListingCalendarIndex(listing);
    expect(
      buildPriceAction({ listing, index, dates: ["2026-03-11"] }),
    ).toBeNull();
  });
});

describe("stepsForPrice", () => {
  it("sends an exclusive checkout date", () => {
    expect(stepsForPrice(["2026-03-11", "2026-03-12"], 150)).toEqual([
      {
        type: "SET_DATE_PRICE",
        startDate: "2026-03-11",
        endDate: "2026-03-13",
        nightlyRate: 150,
      },
    ]);
  });

  it("produces no steps for no dates", () => {
    expect(stepsForPrice([], 150)).toEqual([]);
    expect(stepsForBasePrice([])).toEqual([]);
  });
});

describe("undoStepsForPrices", () => {
  it("restores each date to what it cost before, and clears the rest", () => {
    // Two nights had their own price, the third only ever had the base price. Undo has
    // to put back that distinction, not paint the base amount over all three.
    const listing = makeListing({
      datePrices: [
        { date: "2026-03-11", nightlyRate: 200 },
        { date: "2026-03-12", nightlyRate: 200 },
      ],
    });
    const index = buildListingCalendarIndex(listing);

    expect(
      undoStepsForPrices(index, ["2026-03-11", "2026-03-12", "2026-03-13"]),
    ).toEqual([
      {
        type: "SET_DATE_PRICE",
        startDate: "2026-03-11",
        endDate: "2026-03-13",
        nightlyRate: 200,
      },
      {
        type: "CLEAR_DATE_PRICE",
        startDate: "2026-03-13",
        endDate: "2026-03-14",
      },
    ]);
  });

  it("splits adjacent nights that were priced differently", () => {
    const listing = makeListing({
      datePrices: [
        { date: "2026-03-11", nightlyRate: 200 },
        { date: "2026-03-12", nightlyRate: 150 },
      ],
    });
    const index = buildListingCalendarIndex(listing);
    const steps = undoStepsForPrices(index, ["2026-03-11", "2026-03-12"]);

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ nightlyRate: 200 });
    expect(steps[1]).toMatchObject({ nightlyRate: 150 });
  });
});

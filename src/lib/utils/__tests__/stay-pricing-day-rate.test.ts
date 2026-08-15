import { describe, expect, it } from "vitest";
import { computeDayRate, computeNightlyRateRange } from "@/lib/utils/stay-pricing";

const day = new Date(2030, 5, 2);
const overrides = new Map([["2030-06-02", 200]]);

describe("computeDayRate", () => {
  it("prices a night from its override, or the base rate when it has none", () => {
    expect(computeDayRate({ baseNightly: 100, overrides, day })).toEqual({
      rate: 200,
      originalRate: null,
    });
    expect(
      computeDayRate({ baseNightly: 100, overrides, day: new Date(2030, 5, 3) }),
    ).toEqual({ rate: 100, originalRate: null });
  });

  it("strikes the rate down for an offer any stay length can claim", () => {
    expect(
      computeDayRate({
        baseNightly: 100,
        overrides,
        day,
        promotions: [{ type: "PERCENT_DISCOUNT", discountPercent: 20 }],
      }),
    ).toEqual({ rate: 160, originalRate: 200 });
  });

  it("leaves the cell alone for an offer conditioned on a minimum stay", () => {
    // The guest picking this single night cannot claim a 7-night offer, so the
    // calendar must not quote them its price.
    expect(
      computeDayRate({
        baseNightly: 100,
        overrides,
        day,
        promotions: [
          { type: "PERCENT_DISCOUNT", discountPercent: 20, minimumNights: 7 },
        ],
      }),
    ).toEqual({ rate: 200, originalRate: null });
  });

  it("only applies a dated offer inside its own window", () => {
    const promotions = [
      {
        type: "PERCENT_DISCOUNT" as const,
        discountPercent: 50,
        startDate: new Date(2030, 5, 1),
        endDate: new Date(2030, 5, 30),
      },
    ];

    expect(
      computeDayRate({ baseNightly: 100, overrides, day, promotions }).rate,
    ).toBe(100);
    expect(
      computeDayRate({
        baseNightly: 100,
        overrides,
        day: new Date(2030, 6, 2),
        promotions,
      }),
    ).toEqual({ rate: 100, originalRate: null });
  });

  it("rounds to whole units the way the stay quote bills", () => {
    // 210 − 15% = 178.50, which the quote rounds up to 179 per night.
    expect(
      computeDayRate({
        baseNightly: 210,
        overrides: new Map(),
        day,
        promotions: [
          {
            type: "PERCENT_DISCOUNT",
            discountPercent: 15,
            roundToWholeUnit: true,
          },
        ],
      }),
    ).toEqual({ rate: 179, originalRate: 210 });
  });

  it("takes the deepest discount when several offers apply", () => {
    expect(
      computeDayRate({
        baseNightly: 100,
        overrides: new Map(),
        day,
        promotions: [
          { type: "PERCENT_DISCOUNT", discountPercent: 10 },
          { type: "PERCENT_DISCOUNT", discountPercent: 25 },
        ],
      }),
    ).toEqual({ rate: 75, originalRate: 100 });
  });
});

describe("computeNightlyRateRange", () => {
  const from = new Date(2030, 5, 1);
  const to = new Date(2030, 5, 5);

  it("spans the rates on offer, base rate included", () => {
    expect(
      computeNightlyRateRange({
        baseNightly: 100,
        overrides: new Map([
          ["2030-06-02", 250],
          ["2030-06-03", 80],
        ]),
        blockedRanges: [],
        from,
        to,
      }),
    ).toEqual({ min: 80, max: 250 });
  });

  it("ignores nights nobody can book", () => {
    // The 250 night is blocked, so quoting it would advertise a price the
    // calendar refuses to sell.
    expect(
      computeNightlyRateRange({
        baseNightly: 100,
        overrides: new Map([["2030-06-02", 250]]),
        blockedRanges: [{ from: new Date(2030, 5, 2), to: new Date(2030, 5, 2) }],
        from,
        to,
      }),
    ).toEqual({ min: 100, max: 100 });
  });

  it("has nothing to quote when every night is taken", () => {
    expect(
      computeNightlyRateRange({
        baseNightly: 100,
        overrides: new Map(),
        blockedRanges: [{ from, to }],
        from,
        to,
      }),
    ).toBeNull();
  });
});

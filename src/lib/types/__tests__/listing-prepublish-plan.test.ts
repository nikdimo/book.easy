import { describe, expect, it } from "vitest";
import {
  flattenPlanDatePrices,
  planOfferToPromotion,
  planRangeToAvailabilityBlock,
  planRangeToDbRange,
  type PrePublishRange,
} from "@/lib/types/listing-prepublish-plan";
import { dbDateToYmd, eachYmdExclusive } from "@/lib/utils/date-only";
import { selectApplicablePromotion } from "@/lib/utils/stay-pricing";

/** The publish action writes both an AvailabilityBlock and a dated ListingPromotion
 *  from the same inclusive plan range, so every case below is checked for both. */
function dbRange(range: PrePublishRange) {
  const converted = planRangeToDbRange(range);
  expect(converted).not.toBeNull();
  return {
    startDate: dbDateToYmd(converted!.startDate),
    endDate: dbDateToYmd(converted!.endDate),
  };
}

function dbBlock(range: PrePublishRange) {
  const block = planRangeToAvailabilityBlock(range);
  expect(block).not.toBeNull();
  return {
    startDate: dbDateToYmd(block!.startDate),
    endDate: dbDateToYmd(block!.endDate),
  };
}

function dbOffer(range: PrePublishRange) {
  const offer = planOfferToPromotion({
    ...range,
    type: "PERCENT_DISCOUNT",
    discountPercent: 20,
  });
  expect(offer).not.toBeNull();
  return {
    startDate: dbDateToYmd(offer!.startDate),
    endDate: dbDateToYmd(offer!.endDate),
  };
}

function coveredNights(range: PrePublishRange) {
  const { startDate, endDate } = dbRange(range);
  return eachYmdExclusive(startDate, endDate);
}

describe("planRangeToDbRange", () => {
  it("turns a multi-day selection into the nights the host selected", () => {
    const range = { startDate: "2026-08-03", endDate: "2026-08-07" };

    expect(dbRange(range)).toEqual({
      startDate: "2026-08-03",
      endDate: "2026-08-08",
    });
    expect(coveredNights(range)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ]);
  });

  it("uses the converted range for availability blocks", () => {
    expect(dbBlock({ startDate: "2026-08-03", endDate: "2026-08-07" })).toEqual({
      startDate: "2026-08-03",
      endDate: "2026-08-08",
    });
  });

  it("uses the converted range for dated offers", () => {
    expect(dbOffer({ startDate: "2026-08-03", endDate: "2026-08-07" })).toEqual({
      startDate: "2026-08-03",
      endDate: "2026-08-08",
    });
  });

  it("turns a single-day selection into exactly one night", () => {
    // The regression this phase exists for: an inclusive start === end range used to
    // reach the database as a zero-length row, blocking nothing at all.
    const range = { startDate: "2026-08-03", endDate: "2026-08-03" };

    expect(dbRange(range)).toEqual({
      startDate: "2026-08-03",
      endDate: "2026-08-04",
    });
    expect(coveredNights(range)).toEqual(["2026-08-03"]);
  });

  it("crosses a month boundary", () => {
    const range = { startDate: "2026-08-30", endDate: "2026-09-02" };

    expect(dbRange(range)).toEqual({
      startDate: "2026-08-30",
      endDate: "2026-09-03",
    });
    expect(coveredNights(range)).toHaveLength(4);
  });

  it("crosses a year boundary", () => {
    const range = { startDate: "2026-12-30", endDate: "2027-01-02" };

    expect(dbRange(range)).toEqual({
      startDate: "2026-12-30",
      endDate: "2027-01-03",
    });
    expect(coveredNights(range)).toHaveLength(4);
  });

  it("drops a malformed range rather than failing the publish", () => {
    expect(
      planRangeToDbRange({ startDate: "2026-02-30", endDate: "2026-03-02" })
    ).toBeNull();
    expect(
      planRangeToDbRange({ startDate: "not-a-date", endDate: "2026-03-02" })
    ).toBeNull();
    expect(
      planRangeToDbRange({ startDate: "2026-03-02", endDate: "2026-03-01" })
    ).toBeNull();
  });
});

describe("date prices stay inclusive", () => {
  it("writes one row per selected day and no extra day", () => {
    // Date prices are per-day rows, not a range, so the exclusive conversion must not
    // reach them: five selected days are five rows, Aug 3 through Aug 7.
    const rows = flattenPlanDatePrices([
      { startDate: "2026-08-03", endDate: "2026-08-07", nightlyRate: 90 },
    ]);

    expect(rows.map((row) => row.date)).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
    ]);
    expect(rows.every((row) => row.nightlyRate === 90)).toBe(true);
  });
});

describe("dated offer eligibility end to end", () => {
  it("gives the guest the discount for exactly the nights the host selected", () => {
    const range = planRangeToDbRange({
      startDate: "2026-08-03",
      endDate: "2026-08-07",
    })!;
    const promotion = {
      type: "PERCENT_DISCOUNT" as const,
      discountPercent: 20,
      minimumNights: 1,
      freeCleaning: false,
      roundToWholeUnit: true,
      startDate: range.startDate,
      endDate: range.endDate,
    };

    const applicable = selectApplicablePromotion(
      [promotion],
      new Date(Date.UTC(2026, 7, 3)),
      new Date(Date.UTC(2026, 7, 8)),
      5
    );

    expect(applicable).toBe(promotion);
  });
});

import { describe, expect, it } from "vitest";
import {
  boundedCalendarPromotions,
  calendarCurrencyPrefix,
  formatCellAmount,
} from "@/components/public/use-listing-day-prices";
import type { StayPromotion } from "@/lib/utils/stay-pricing";

describe("boundedCalendarPromotions", () => {
  it("keeps only promotions with a concrete, forward date window", () => {
    const bounded: StayPromotion = {
      id: "bounded",
      type: "PERCENT_DISCOUNT",
      discountPercent: 15,
      startDate: "2030-06-01",
      endDate: "2030-06-08",
    };
    const promotions: StayPromotion[] = [
      bounded,
      {
        id: "length-only",
        type: "PERCENT_DISCOUNT",
        discountPercent: 23,
        minimumNights: 8,
      },
      {
        id: "open-ended",
        type: "PERCENT_DISCOUNT",
        discountPercent: 10,
        startDate: "2030-06-01",
      },
      {
        id: "invalid",
        type: "PERCENT_DISCOUNT",
        discountPercent: 10,
        startDate: "not-a-date",
        endDate: "2030-06-08",
      },
      {
        id: "backwards",
        type: "PERCENT_DISCOUNT",
        discountPercent: 10,
        startDate: "2030-06-08",
        endDate: "2030-06-01",
      },
    ];

    expect(boundedCalendarPromotions(promotions)).toEqual([bounded]);
  });

  it("preserves an absent promotions value", () => {
    expect(boundedCalendarPromotions(undefined)).toBeUndefined();
  });
});

describe("calendarCurrencyPrefix", () => {
  it("keeps the symbols that are symbols", () => {
    expect(calendarCurrencyPrefix("EUR")).toBe("€");
    expect(calendarCurrencyPrefix("USD")).toBe("$");
    expect(calendarCurrencyPrefix("DKK")).toBe("kr");
    expect(calendarCurrencyPrefix("PLN")).toBe("zł");
    expect(calendarCurrencyPrefix("BRL")).toBe("R$");
  });

  it("drops the ones that are words, which crowd the amount out of the cell", () => {
    // Three characters and up are a currency *code* standing in for a symbol —
    // "MKD11,217" is as much letters as it is price, in a cell a seventh of a month
    // wide. XPF's "CFPF" and XOF's "FCFA" are the extreme of the same thing.
    expect(calendarCurrencyPrefix("MKD")).toBe("");
    expect(calendarCurrencyPrefix("CHF")).toBe("");
    expect(calendarCurrencyPrefix("RON")).toBe("");
    expect(calendarCurrencyPrefix("XPF")).toBe("");
    expect(calendarCurrencyPrefix("XOF")).toBe("");
  });

  it("drops a code with no symbol at all", () => {
    // Intl hands back the code itself for anything it does not know, which is three
    // letters and therefore never worth the room.
    expect(calendarCurrencyPrefix("ZZZ")).toBe("");
  });
});

describe("formatCellAmount", () => {
  it("spells out anything a cell can hold", () => {
    expect(formatCellAmount(90, "en")).toBe("90");
    expect(formatCellAmount(11217, "en")).toBe("11,217");
    expect(formatCellAmount(99999, "en")).toBe("99,999");
  });

  it("shortens the six- and seven-figure amounts that never fit", () => {
    expect(formatCellAmount(150000, "en")).toBe("150K");
    expect(formatCellAmount(1500000, "en")).toBe("1.5M");
  });

  it("carries a rounded thousand up to a million rather than saying 1000K", () => {
    expect(formatCellAmount(999500, "en")).toBe("1M");
  });

  it("takes its digits and decimal mark from the reader's locale", () => {
    // The suffix is deliberately not localized: Intl's own compact notation renders
    // this as "1,5 мил.", which is wider than the number it shortens.
    expect(formatCellAmount(1500000, "mk")).toBe("1,5M");
    expect(formatCellAmount(11217, "mk")).toBe("11.217");
  });
});

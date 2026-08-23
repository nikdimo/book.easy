import { describe, expect, it } from "vitest";
import { buildCalendarFormats } from "@/lib/host/v2/calendar-format";
import { sumMoney } from "@/components/host/v2/reservations/reservation-labels";

const amounts = [
  { amount: 100, currency: "EUR" },
  { amount: 100, currency: "USD" },
];

describe("sumMoney", () => {
  it("converts every leg before adding a mixed-currency portfolio", () => {
    const formats = buildCalendarFormats("en", ["EUR", "USD"], {
      currency: "DKK",
      rates: { EUR: 1, USD: 1.08, DKK: 7.46 },
    });

    const result = sumMoney(amounts, "EUR", formats);
    expect(result).toContain("1,437");
    expect(result).toContain("kr");
  });

  it("never presents a partial converted sum as the portfolio total", () => {
    const formats = buildCalendarFormats("en", ["EUR", "USD"], {
      currency: "DKK",
      rates: { EUR: 1, DKK: 7.46 },
    });

    expect(sumMoney(amounts, "EUR", formats)).toBe("—");
  });

  it("never adds raw mixed currencies while exchange rates are unavailable", () => {
    const formats = buildCalendarFormats("en", ["EUR", "USD"]);
    expect(sumMoney(amounts, "EUR", formats)).toBe("—");
  });

  it("can still total one official currency without conversion", () => {
    const formats = buildCalendarFormats("en", ["USD"]);
    expect(
      sumMoney(
        [
          { amount: 40, currency: "USD" },
          { amount: 60, currency: "USD" },
        ],
        "USD",
        formats,
      ),
    ).toContain("100");
  });
});

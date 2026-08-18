import { describe, expect, it } from "vitest";
import {
  computeSelectionQuote,
  meetsMinimumStay,
  overridesAfterProposal,
  promotionSaveMode,
  resolveSelectionPromotion,
} from "@/lib/host/v2/calendar-quote";
import { computeStayQuote, parseLocalYmd } from "@/lib/utils/stay-pricing";
import { makeListing, promotion } from "./fixtures";

const selection = { start: "2026-03-12", end: "2026-03-14" };

describe("overridesAfterProposal", () => {
  it("applies a proposed rate to every selected date", () => {
    const listing = makeListing({
      datePrices: [{ date: "2026-03-20", nightlyRate: 200 }],
    });
    const overrides = overridesAfterProposal(
      listing,
      ["2026-03-12", "2026-03-13"],
      { mode: "SET", value: 175 },
    );
    expect(overrides.get("2026-03-12")).toBe(175);
    expect(overrides.get("2026-03-13")).toBe(175);
    expect(overrides.get("2026-03-20")).toBe(200);
  });

  it("removes the override when the host resets to the base price", () => {
    const listing = makeListing({
      datePrices: [{ date: "2026-03-12", nightlyRate: 200 }],
    });
    const overrides = overridesAfterProposal(listing, ["2026-03-12"], {
      mode: "RESET",
    });
    expect(overrides.has("2026-03-12")).toBe(false);
  });
});

describe("computeSelectionQuote", () => {
  it("matches the canonical stay quote exactly, including date overrides", () => {
    const listing = makeListing({
      datePrices: [{ date: "2026-03-13", nightlyRate: 200 }],
    });
    const quote = computeSelectionQuote({ listing, selection });
    const canonical = computeStayQuote({
      baseNightly: 120,
      cleaningFee: 30,
      checkIn: parseLocalYmd("2026-03-12"),
      checkOut: parseLocalYmd("2026-03-15"),
      overrides: new Map([["2026-03-13", 200]]),
      promotions: [],
    });
    expect(quote).toEqual(canonical);
    // 120 + 200 + 120 accommodation, plus the cleaning fee.
    expect(quote?.originalAccommodationSubtotal).toBe(440);
    expect(quote?.total).toBe(470);
  });

  it("prices the proposed nightly rate rather than the stored one", () => {
    const listing = makeListing();
    const quote = computeSelectionQuote({
      listing,
      selection,
      proposedNightlyRate: { mode: "SET", value: 140 },
    });
    expect(quote?.originalAccommodationSubtotal).toBe(420);
    expect(quote?.total).toBe(450);
  });

  it("uses the canonical promotion engine for a proposed discount", () => {
    const listing = makeListing();
    const quote = computeSelectionQuote({
      listing,
      selection,
      proposedPromotion: {
        discountPercent: 20,
        minimumNights: 1,
        freeCleaning: false,
        roundToWholeUnit: false,
      },
    });
    expect(quote?.originalAccommodationSubtotal).toBe(360);
    expect(quote?.accommodationDiscount).toBe(72);
    expect(quote?.accommodationSubtotal).toBe(288);
    expect(quote?.total).toBe(318);
    expect(quote?.effectiveAverageNightly).toBe(96);
  });

  it("waives the cleaning fee through the same engine, never by hand", () => {
    const listing = makeListing();
    const quote = computeSelectionQuote({
      listing,
      selection,
      proposedPromotion: {
        discountPercent: 0,
        minimumNights: 1,
        freeCleaning: true,
        roundToWholeUnit: false,
      },
    });
    expect(quote?.cleaningDiscount).toBe(30);
    expect(quote?.cleaningFee).toBe(0);
    expect(quote?.total).toBe(360);
  });

  it("keeps an existing always-active promotion in the picture", () => {
    const listing = makeListing({
      promotions: [promotion({ discountPercent: 10 })],
    });
    const quote = computeSelectionQuote({ listing, selection });
    expect(quote?.appliedPromotion?.id).toBe("promotion-1");
    expect(quote?.accommodationDiscount).toBe(36);
  });

  it("returns nothing to show when the listing has no pricing", () => {
    expect(
      computeSelectionQuote({ listing: makeListing({ pricing: null }), selection }),
    ).toBeNull();
  });
});

describe("resolveSelectionPromotion", () => {
  it("finds the always-active offer a guest would actually get", () => {
    const listing = makeListing({
      promotions: [promotion({ discountPercent: 10, minimumNights: 1 })],
    });
    expect(resolveSelectionPromotion(listing, selection)?.id).toBe("promotion-1");
  });

  it("ignores an offer whose minimum stay the selection does not reach", () => {
    const listing = makeListing({
      promotions: [promotion({ discountPercent: 25, minimumNights: 7 })],
    });
    expect(resolveSelectionPromotion(listing, selection)).toBeNull();
  });

  it("ignores a dated offer that does not cover the selection", () => {
    const listing = makeListing({
      promotions: [
        promotion({
          minimumNights: 1,
          startDate: "2026-05-01",
          endDate: "2026-06-01",
        }),
      ],
    });
    expect(resolveSelectionPromotion(listing, selection)).toBeNull();
  });

  it("prefers the dated offer over the always-active one, as booking does", () => {
    const listing = makeListing({
      promotions: [
        promotion({ id: "evergreen", discountPercent: 30, minimumNights: 1 }),
        promotion({
          id: "dated",
          discountPercent: 10,
          minimumNights: 1,
          startDate: "2026-03-12",
          endDate: "2026-03-15",
        }),
      ],
    });
    expect(resolveSelectionPromotion(listing, selection)?.id).toBe("dated");
  });
});

describe("promotionSaveMode", () => {
  it("creates when nothing applies", () => {
    expect(promotionSaveMode(null, selection)).toBe("CREATE");
  });

  it("edits only an offer whose own dates are exactly this range", () => {
    const exact = promotion({
      startDate: "2026-03-12",
      endDate: "2026-03-15",
    });
    expect(promotionSaveMode(exact, selection)).toBe("EDIT");
  });

  it("overrides an always-active offer instead of rewriting it", () => {
    expect(promotionSaveMode(promotion(), selection)).toBe("OVERRIDE");
  });

  it("overrides a dated offer with different bounds", () => {
    const wider = promotion({
      startDate: "2026-03-01",
      endDate: "2026-04-01",
    });
    expect(promotionSaveMode(wider, selection)).toBe("OVERRIDE");
  });
});

describe("meetsMinimumStay", () => {
  it("knows when the selection is too short to be a real stay", () => {
    const listing = makeListing({
      pricing: {
        currency: "EUR",
        baseNightlyRate: 120,
        cleaningFee: 30,
        minNights: 4,
        maxNights: 365,
      },
    });
    expect(meetsMinimumStay(listing, selection)).toBe(false);
    expect(
      meetsMinimumStay(listing, { start: "2026-03-12", end: "2026-03-16" }),
    ).toBe(true);
  });
});

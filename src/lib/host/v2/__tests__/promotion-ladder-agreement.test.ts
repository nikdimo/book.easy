import { promotionBands } from "@/lib/host/v2/calendar-promotion-action";
import type {
  HostCalendarDatePrice,
  HostCalendarPromotion,
} from "@/lib/host/v2/calendar-types";
import {
  computeStayQuote,
  parseLocalYmd,
  selectApplicablePromotion,
  type StayPromotion,
} from "@/lib/utils/stay-pricing";
import { addDaysToYmd } from "@/lib/utils/date-only";
import { makeListing, promotion } from "./fixtures";
import { describe, expect, it } from "vitest";

/**
 * #9: the host's promotion ladder and the price a guest is quoted must be one answer.
 *
 * The ladder now calls `computeStayQuote` with the listing's real base price, cleaning
 * fee and date-price overrides. These tests compare the public ladder output with that
 * quote directly, including the two cases a rate-free approximation cannot model:
 * valuable date overrides and a free-cleaning offer that is worth displacing a nightly
 * percentage on one night.
 */

const START = "2026-03-20";
const checkIn = parseLocalYmd(START);

const dated = promotion({
  id: "dated",
  discountPercent: 25,
  minimumNights: 1,
  startDate: START,
  endDate: addDaysToYmd(START, 3),
});

const evergreen = promotion({
  id: "evergreen",
  discountPercent: 10,
  minimumNights: 1,
});

function toStayPromotion(value: HostCalendarPromotion): StayPromotion {
  return {
    ...value,
    startDate: value.startDate,
    endDate: value.endDate,
  };
}

function quoteFor({
  promotions,
  nights,
  datePrices = [],
  cleaningFee = 0,
}: {
  promotions: HostCalendarPromotion[];
  nights: number;
  datePrices?: HostCalendarDatePrice[];
  cleaningFee?: number;
}) {
  return computeStayQuote({
    baseNightly: 100,
    cleaningFee,
    checkIn,
    checkOut: parseLocalYmd(addDaysToYmd(START, nights)),
    overrides: new Map(datePrices.map((price) => [price.date, price.nightlyRate])),
    promotions: promotions.map(toStayPromotion),
  });
}

function ladderWinner({
  promotions,
  nights,
  datePrices = [],
  cleaningFee = 0,
}: {
  promotions: HostCalendarPromotion[];
  nights: number;
  datePrices?: HostCalendarDatePrice[];
  cleaningFee?: number;
}) {
  const listing = makeListing({
    pricing: {
      currency: "EUR",
      baseNightlyRate: 100,
      cleaningFee,
      minNights: 1,
      maxNights: 0,
    },
    datePrices,
    promotions,
  });
  return promotionBands({
    listing,
    selection: { start: START, end: addDaysToYmd(START, 2) },
    draft: null,
    horizon: 15,
  }).find(
    (band) =>
      nights >= band.fromNights &&
      (band.openEnded || nights <= band.toNights),
  );
}

describe("the promotion ladder agrees with the booking quote", () => {
  it("agrees on eligibility, headline and partial coverage at every stay length", () => {
    for (const promotions of [[dated], [dated, evergreen], [evergreen]]) {
      for (let nights = 1; nights <= 15; nights += 1) {
        const quote = quoteFor({ promotions, nights });
        const band = ladderWinner({ promotions, nights });
        expect(Boolean(band), `nights=${nights}`).toBe(quote.promotionEligible);
        expect(band?.promotionId, `nights=${nights}`).toBe(
          quote.appliedPromotion?.id,
        );
        expect(band?.partial ?? false, `nights=${nights}`).toBe(
          quote.nightlyBreakdown.some((night) => night.promotionId === null),
        );
      }
    }
  });

  it("uses actual date prices when choosing the headline offer", () => {
    const datePrices: HostCalendarDatePrice[] = Array.from(
      { length: 8 },
      (_, index) => ({
        date: addDaysToYmd(START, index),
        nightlyRate: index < 3 ? 10 : 500,
      }),
    );
    const quote = quoteFor({
      promotions: [dated, evergreen],
      nights: 8,
      datePrices,
    });
    const band = ladderWinner({
      promotions: [dated, evergreen],
      nights: 8,
      datePrices,
    });

    expect(quote.appliedPromotion?.id).toBe("evergreen");
    expect(band?.promotionId).toBe(quote.appliedPromotion?.id);
  });

  it("models the quote engine's free-cleaning optimization", () => {
    const percent = promotion({ id: "percent", discountPercent: 20 });
    const freeCleaning = promotion({
      id: "cleaning",
      type: "FREE_CLEANING",
      discountPercent: 0,
      freeCleaning: true,
    });
    const quote = quoteFor({
      promotions: [percent, freeCleaning],
      nights: 2,
      cleaningFee: 100,
    });
    const band = ladderWinner({
      promotions: [percent, freeCleaning],
      nights: 2,
      cleaningFee: 100,
    });

    expect(quote.appliedPromotion?.id).toBe("cleaning");
    expect(band?.promotionId).toBe(quote.appliedPromotion?.id);
  });

  it("keeps partial discounts that the deprecated whole-stay selector misses", () => {
    const nights = 5;
    const quote = quoteFor({ promotions: [dated], nights });
    expect(
      selectApplicablePromotion(
        [toStayPromotion(dated)],
        checkIn,
        parseLocalYmd(addDaysToYmd(START, nights)),
        nights,
      ),
    ).toBeNull();

    const band = ladderWinner({ promotions: [dated], nights });
    expect(quote.promotionEligible).toBe(true);
    expect(band).toMatchObject({ promotionId: "dated", partial: true });
  });
});

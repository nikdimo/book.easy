import { describe, expect, it } from "vitest";
import {
  DRAFT_PROMOTION_ID,
  evergreenBands,
  evergreenLadder,
  evergreenMinimumClash,
  selectionLadder,
  promotionBands,
  promotionDraftProblem,
  selectionDraftCanWin,
} from "@/lib/host/v2/calendar-promotion-action";
import { makeListing, promotion, TODAY } from "./fixtures";

const SELECTION = { start: "2026-03-20", end: "2026-03-22" };
const NIGHTS = 3;

describe("promotionBands", () => {
  it("reads a ladder of always-active offers as bands of stay length", () => {
    const listing = makeListing({
      promotions: [
        promotion({ id: "ten", discountPercent: 10, minimumNights: 10 }),
        promotion({ id: "twenty", discountPercent: 20, minimumNights: 20 }),
      ],
    });
    const bands = promotionBands({ listing, selection: SELECTION, draft: null });

    expect(bands).toEqual([
      expect.objectContaining({
        promotionId: "ten",
        fromNights: 10,
        toNights: 19,
        openEnded: false,
        discountPercent: 10,
      }),
      expect.objectContaining({
        promotionId: "twenty",
        fromNights: 20,
        toNights: 30,
        openEnded: true,
        discountPercent: 20,
      }),
    ]);
  });

  it("stops a dated offer at the length that outgrows its own range", () => {
    // A three-night offer cannot reach a stay that runs past its last night, because a
    // dated offer applies only when the whole stay fits inside it.
    const listing = makeListing({
      promotions: [
        promotion({
          id: "dated",
          discountPercent: 25,
          minimumNights: 1,
          startDate: "2026-03-20",
          endDate: "2026-03-23",
        }),
        promotion({ id: "ten", discountPercent: 10, minimumNights: 10 }),
      ],
    });
    const bands = promotionBands({ listing, selection: SELECTION, draft: null });

    expect(bands[0]).toMatchObject({
      promotionId: "dated",
      fromNights: 1,
      toNights: 3,
    });
    expect(bands[1]).toMatchObject({ promotionId: "ten", fromNights: 10 });
  });

  it("ranks the draft against saved offers instead of assuming it wins", () => {
    // The bug this replaces: the panel promised a new dated offer would take priority.
    // Against another dated offer the bigger discount wins, so a smaller one never runs.
    const listing = makeListing({
      promotions: [
        promotion({
          id: "august",
          discountPercent: 20,
          minimumNights: 1,
          startDate: "2026-03-01",
          endDate: "2026-04-01",
        }),
      ],
    });
    const bands = promotionBands({
      listing,
      selection: SELECTION,
      draft: {
        discountPercent: 10,
        minimumNights: 1,
        freeCleaning: false,
        roundToWholeUnit: true,
      },
    });

    expect(bands.some((band) => band.draft)).toBe(false);
    expect(bands[0]).toMatchObject({ promotionId: "august" });
  });

  it("replaces the offer a draft is editing rather than ranking against it", () => {
    const listing = makeListing({
      promotions: [
        promotion({
          id: "dated",
          discountPercent: 30,
          minimumNights: 1,
          startDate: "2026-03-20",
          endDate: "2026-03-23",
        }),
      ],
    });
    const bands = promotionBands({
      listing,
      selection: SELECTION,
      draft: {
        promotionId: "dated",
        discountPercent: 5,
        minimumNights: 1,
        freeCleaning: false,
        roundToWholeUnit: true,
      },
    });

    expect(bands[0]).toMatchObject({
      promotionId: DRAFT_PROMOTION_ID,
      discountPercent: 5,
      draft: true,
    });
  });

  it("has nothing to report when the listing has no offers", () => {
    expect(
      promotionBands({ listing: makeListing(), selection: SELECTION, draft: null }),
    ).toEqual([]);
  });
});

describe("promotionDraftProblem", () => {
  const draft = {
    discountPercent: 10,
    minimumNights: 1,
    freeCleaning: false,
    roundToWholeUnit: true,
  };

  it("names an offer that gives the guest nothing", () => {
    expect(
      promotionDraftProblem({
        draft: { ...draft, discountPercent: 0 },
        bands: [],
        nights: NIGHTS,
      }),
    ).toEqual({ code: "NO_BENEFIT" });
  });

  it("allows a minimum longer than the selected range when a longer booking can earn it", () => {
    const longerStayDraft = { ...draft, minimumNights: 5, discountPercent: 25 };
    const listing = makeListing();
    expect(
      promotionDraftProblem({
        draft: longerStayDraft,
        bands: [],
        nights: NIGHTS,
        draftApplied: selectionDraftCanWin({
          listing,
          selection: SELECTION,
          draft: longerStayDraft,
        }),
      }),
    ).toBeNull();
  });

  it("recognizes a short dated offer inside a longer qualifying booking", () => {
    expect(
      selectionDraftCanWin({
        listing: makeListing(),
        selection: { start: "2026-09-29", end: "2026-09-30" },
        draft: { ...draft, discountPercent: 5, minimumNights: 5 },
      }),
    ).toBe(true);
  });

  it("recognizes when a better all-dates offer shadows every qualifying stay", () => {
    expect(
      selectionDraftCanWin({
        listing: makeListing({
          promotions: [
            promotion({ id: "global", discountPercent: 15, minimumNights: 1 }),
          ],
        }),
        selection: { start: "2026-09-29", end: "2026-09-30" },
        draft: { ...draft, discountPercent: 5, minimumNights: 5 },
      }),
    ).toBe(false);
  });

  it("names an offer that is valid but always loses", () => {
    const listing = makeListing({
      promotions: [
        promotion({
          id: "august",
          discountPercent: 20,
          minimumNights: 1,
          startDate: "2026-03-01",
          endDate: "2026-04-01",
        }),
      ],
    });
    const bands = promotionBands({ listing, selection: SELECTION, draft });

    expect(promotionDraftProblem({ draft, bands, nights: NIGHTS })).toEqual({
      code: "NEVER_WINS",
      discountPercent: 20,
      winnerIsEvergreen: false,
    });
  });

  it("is silent when the draft actually reaches the guest", () => {
    const listing = makeListing();
    const bands = promotionBands({ listing, selection: SELECTION, draft });
    expect(promotionDraftProblem({ draft, bands, nights: NIGHTS })).toBeNull();
  });
});

describe("evergreenBands", () => {
  it("reads several always-active offers as a ladder", () => {
    const listing = makeListing({
      promotions: [
        promotion({ id: "five", discountPercent: 10, minimumNights: 5 }),
        promotion({ id: "twenty", discountPercent: 20, minimumNights: 20 }),
      ],
    });
    const bands = evergreenBands({ listing, draft: null, today: TODAY });

    expect(bands).toEqual([
      expect.objectContaining({ promotionId: "five", fromNights: 5, toNights: 19 }),
      expect.objectContaining({
        promotionId: "twenty",
        fromNights: 20,
        openEnded: true,
      }),
    ]);
  });

  it("ignores dated offers, which this screen is not about", () => {
    const listing = makeListing({
      promotions: [
        promotion({
          id: "dated",
          discountPercent: 40,
          minimumNights: 1,
          startDate: "2026-03-01",
          endDate: "2026-04-01",
        }),
      ],
    });
    expect(evergreenBands({ listing, draft: null, today: TODAY })).toEqual([]);
  });

  it("ranks a new offer alongside the saved ones", () => {
    const listing = makeListing({
      promotions: [
        promotion({ id: "five", discountPercent: 10, minimumNights: 5 }),
      ],
    });
    const bands = evergreenBands({
      listing,
      draft: {
        discountPercent: 25,
        minimumNights: 14,
        freeCleaning: false,
        roundToWholeUnit: true,
      },
      today: TODAY,
    });

    expect(bands[0]).toMatchObject({ promotionId: "five", fromNights: 5 });
    expect(bands[1]).toMatchObject({
      promotionId: DRAFT_PROMOTION_ID,
      fromNights: 14,
      draft: true,
    });
  });

  it("replaces the offer a draft is editing rather than ranking against it", () => {
    const listing = makeListing({
      promotions: [
        promotion({ id: "five", discountPercent: 10, minimumNights: 5 }),
      ],
    });
    const bands = evergreenBands({
      listing,
      draft: {
        promotionId: "five",
        discountPercent: 30,
        minimumNights: 5,
        freeCleaning: false,
        roundToWholeUnit: true,
      },
      today: TODAY,
    });

    expect(bands).toHaveLength(1);
    expect(bands[0]).toMatchObject({ discountPercent: 30, draft: true });
  });
});

describe("evergreenMinimumClash", () => {
  const listing = makeListing({
    promotions: [
      promotion({ id: "five", discountPercent: 10, minimumNights: 5 }),
    ],
  });

  it("finds the offer already sitting at this minimum", () => {
    expect(
      evergreenMinimumClash({
        listing,
        draft: {
          discountPercent: 20,
          minimumNights: 5,
          freeCleaning: false,
          roundToWholeUnit: true,
        },
      })?.id,
    ).toBe("five");
  });

  it("does not count the offer the draft is editing", () => {
    expect(
      evergreenMinimumClash({
        listing,
        draft: {
          promotionId: "five",
          discountPercent: 20,
          minimumNights: 5,
          freeCleaning: false,
          roundToWholeUnit: true,
        },
      }),
    ).toBeNull();
  });

  it("is silent at a free minimum", () => {
    expect(
      evergreenMinimumClash({
        listing,
        draft: {
          discountPercent: 20,
          minimumNights: 12,
          freeCleaning: false,
          roundToWholeUnit: true,
        },
      }),
    ).toBeNull();
  });
});

describe("evergreenLadder", () => {
  it("lists every offer, in ladder order", () => {
    const listing = makeListing({
      promotions: [
        promotion({ id: "twenty", discountPercent: 20, minimumNights: 20 }),
        promotion({ id: "five", discountPercent: 10, minimumNights: 5 }),
      ],
    });
    const rows = evergreenLadder({ listing, draft: null, today: TODAY });

    expect(rows.map((row) => row.promotionId)).toEqual(["five", "twenty"]);
    expect(rows[0].bands).toHaveLength(1);
    expect(rows[1].bands[0]).toMatchObject({ fromNights: 20, openEnded: true });
  });

  it("keeps a row for an offer whose minimum is past the horizon", () => {
    // Nothing can be said about where it wins, but it still has to be reachable — the
    // row is the only way to open an offer, and an unreachable offer cannot be fixed.
    const listing = makeListing({
      promotions: [
        promotion({ id: "far", discountPercent: 30, minimumNights: 45 }),
      ],
    });
    const rows = evergreenLadder({ listing, draft: null, today: TODAY });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      promotionId: "far",
      bands: [],
      beyondHorizon: true,
      minimumNights: 45,
    });
  });
});

describe("selectionLadder", () => {
  it("keeps a row for an offer that is beaten at every stay length", () => {
    // A dated offer covering all of March beats a smaller one on three nights inside
    // it, at every length. The loser still gets a row, marked as winning nothing.
    const listing = makeListing({
      promotions: [
        promotion({
          id: "march",
          discountPercent: 30,
          minimumNights: 1,
          startDate: "2026-03-01",
          endDate: "2026-04-01",
        }),
        promotion({
          id: "small",
          discountPercent: 5,
          minimumNights: 1,
          startDate: "2026-03-20",
          endDate: "2026-03-23",
        }),
      ],
    });
    const rows = selectionLadder({ listing, selection: SELECTION, draft: null });

    const small = rows.find((row) => row.promotionId === "small");
    expect(small).toBeDefined();
    expect(small?.bands).toEqual([]);
    expect(small?.beyondHorizon).toBe(false);
  });

  it("gives the draft a row even when it never wins", () => {
    const listing = makeListing({
      promotions: [
        promotion({
          id: "march",
          discountPercent: 30,
          minimumNights: 1,
          startDate: "2026-03-01",
          endDate: "2026-04-01",
        }),
      ],
    });
    const rows = selectionLadder({
      listing,
      selection: SELECTION,
      draft: {
        discountPercent: 5,
        minimumNights: 1,
        freeCleaning: false,
        roundToWholeUnit: true,
      },
    });

    const draftRow = rows.find((row) => row.draft);
    expect(draftRow).toBeDefined();
    expect(draftRow?.bands).toEqual([]);
  });
});

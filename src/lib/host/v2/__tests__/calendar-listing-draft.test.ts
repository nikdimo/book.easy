import { describe, expect, it } from "vitest";
import {
  defaultsDraft,
  defaultsFormOf,
  listingCtaFor,
  ongoingPromotionDraft,
  ongoingPromotionFormOf,
  ongoingPromotionOf,
  visibilityDraft,
  type DefaultsForm,
  type OngoingPromotionForm,
} from "@/lib/host/v2/calendar-listing-draft";
import {
  buildListingCalendarIndex,
  countDates,
} from "@/lib/host/v2/calendar-model";
import { summarizeListingStatus } from "@/lib/host/v2/listing-status";
import {
  buildListingReviewPlan,
  type ListingChange,
} from "@/lib/host/v2/calendar-review";
import {
  leavingLosesWork,
  MENU_VIEW,
  viewAfterScopeChange,
} from "@/lib/host/v2/calendar-workbench";
import { HORIZON_END, makeListing, promotion, TODAY } from "./fixtures";

describe("visibility decisions", () => {
  it("stages nothing until something differs from what is stored", () => {
    const listing = makeListing({ status: "APPROVED" });
    expect(visibilityDraft(null, listing)).toBeNull();
    expect(
      visibilityDraft({ field: "visibility", to: "LIVE" }, listing),
    ).toBeNull();
  });

  it("stages hiding a live listing", () => {
    const listing = makeListing({ status: "APPROVED" });
    expect(visibilityDraft({ field: "visibility", to: "HIDDEN" }, listing)).toEqual(
      { kind: "VISIBILITY", to: "HIDDEN" },
    );
  });

  it("stages publishing a listing that is ready", () => {
    const listing = makeListing({ status: "UNPUBLISHED" });
    expect(visibilityDraft({ field: "visibility", to: "LIVE" }, listing)).toEqual({
      kind: "VISIBILITY",
      to: "LIVE",
    });
  });

  it("stages nothing for a move the listing cannot make", () => {
    // A disabled button that explains itself beats an enabled one that opens a
    // dialog only to refuse.
    const suspended = makeListing({ status: "SUSPENDED" });
    expect(visibilityDraft({ field: "visibility", to: "LIVE" }, suspended)).toBeNull();
    const draft = makeListing({ status: "DRAFT" });
    expect(visibilityDraft({ field: "visibility", to: "HIDDEN" }, draft)).toBeNull();
  });

  it("stages the availability rule only when it actually changes", () => {
    const open = makeListing({ availabilityMode: "OPEN" });
    expect(visibilityDraft({ field: "mode", to: "OPEN" }, open)).toBeNull();
    expect(visibilityDraft({ field: "mode", to: "CLOSED" }, open)).toEqual({
      kind: "AVAILABILITY_MODE",
      to: "CLOSED",
    });
  });

  it("stages a minimum stay, and refuses a half-typed or invalid one", () => {
    const listing = makeListing();
    expect(visibilityDraft({ field: "minNights", value: "3" }, listing)).toEqual({
      kind: "MIN_NIGHTS",
      to: 3,
    });
    // The stored value is 2, so this is a no-op rather than a change.
    expect(visibilityDraft({ field: "minNights", value: "2" }, listing)).toBeNull();
    for (const value of ["", "  ", "0", "-1", "2.5", "abc", "400"]) {
      expect(visibilityDraft({ field: "minNights", value }, listing)).toBeNull();
    }
  });

  it("stages no minimum stay at all without a pricing rule to compare against", () => {
    const listing = makeListing({ pricing: null });
    expect(visibilityDraft({ field: "minNights", value: "3" }, listing)).toBeNull();
  });

  it("holds one decision at a time, so a review can only ever carry one", () => {
    const listing = makeListing({ status: "APPROVED", availabilityMode: "OPEN" });
    const first = visibilityDraft({ field: "visibility", to: "HIDDEN" }, listing);
    const second = visibilityDraft({ field: "mode", to: "CLOSED" }, listing);
    expect(first).toEqual({ kind: "VISIBILITY", to: "HIDDEN" });
    expect(second).toEqual({ kind: "AVAILABILITY_MODE", to: "CLOSED" });
    // Each call answers for exactly one decision; there is no shape here that could
    // describe both at once.
    expect(Object.keys(second as object)).toEqual(["kind", "to"]);
  });
});

describe("default pricing", () => {
  const listing = makeListing();
  const stored = defaultsFormOf(listing);

  it("reads the stored rule back as its own starting point", () => {
    expect(stored).toEqual({
      baseNightlyRate: "120",
      cleaningFee: "30",
      minNights: "2",
    });
    expect(defaultsDraft(stored, listing)).toBeNull();
  });

  it("carries only the field the host actually edited", () => {
    // The review model fills the rest from the pricing rule it loaded. Sending a
    // value from here that the host did not type would re-save whatever this screen
    // happened to be showing, which is not the same as what is stored.
    expect(defaultsDraft({ ...stored, baseNightlyRate: "150" }, listing)).toEqual({
      kind: "DEFAULT_PRICING",
      to: { baseNightlyRate: 150 },
    });
    expect(defaultsDraft({ ...stored, cleaningFee: "0" }, listing)).toEqual({
      kind: "DEFAULT_PRICING",
      to: { cleaningFee: 0 },
    });
    expect(defaultsDraft({ ...stored, minNights: "4" }, listing)).toEqual({
      kind: "DEFAULT_PRICING",
      to: { minNights: 4 },
    });
  });

  it("carries several fields when several were edited, and no others", () => {
    const draft = defaultsDraft(
      { baseNightlyRate: "150", cleaningFee: "45", minNights: "2" },
      listing,
    );
    expect(draft).toEqual({
      kind: "DEFAULT_PRICING",
      to: { baseNightlyRate: 150, cleaningFee: 45 },
    });
    // `minNights` was untouched, so it is absent rather than resent.
    expect(
      Object.keys((draft as { to: Record<string, number> }).to),
    ).not.toContain("minNights");
  });

  it("stages nothing for an invalid or half-typed value", () => {
    const invalid: DefaultsForm[] = [
      { ...stored, baseNightlyRate: "" },
      { ...stored, baseNightlyRate: "0" },
      { ...stored, baseNightlyRate: "abc" },
      { ...stored, cleaningFee: "" },
      { ...stored, cleaningFee: "-5" },
      { ...stored, minNights: "" },
      { ...stored, minNights: "0" },
      { ...stored, minNights: "2.5" },
      { ...stored, minNights: "400" },
    ];
    for (const form of invalid) expect(defaultsDraft(form, listing)).toBeNull();
  });

  it("stages nothing without a loaded rule to merge the untouched fields with", () => {
    const unpriced = makeListing({ pricing: null });
    expect(
      defaultsDraft(
        { baseNightlyRate: "150", cleaningFee: "20", minNights: "2" },
        unpriced,
      ),
    ).toBeNull();
  });
});

describe("ongoing promotions", () => {
  const saved = promotion({
    id: "ongoing-1",
    discountPercent: 12,
    minimumNights: 3,
    freeCleaning: true,
    roundToWholeUnit: false,
  });

  it("finds the always-active offer and ignores dated ones", () => {
    const listing = makeListing({
      promotions: [
        promotion({ id: "dated", startDate: "2026-04-01", endDate: "2026-04-08" }),
        saved,
      ],
    });
    expect(ongoingPromotionOf(listing)?.id).toBe("ongoing-1");
    expect(ongoingPromotionOf(makeListing())).toBeNull();
  });

  it("seeds the form from the saved offer with its exact stored rounding", () => {
    // The bug this guards: seeding `roundToWholeUnit` with `?? true` would turn a
    // saved `false` into `true`, and a save the host thought only touched the
    // percentage would quietly change how every discounted night is priced.
    const listing = makeListing({ promotions: [saved] });
    const form = ongoingPromotionFormOf(listing);
    expect(form).toEqual({
      promotionId: "ongoing-1",
      discountPercent: "12",
      minimumNights: "3",
      freeCleaning: true,
      roundToWholeUnit: false,
      removing: false,
    });
    // Seeded straight back in, it is a no-op — nothing was invented on the way.
    expect(ongoingPromotionDraft(form, listing)).toBeNull();
  });

  it("defaults rounding on only when there is no saved value to overwrite", () => {
    const form = ongoingPromotionFormOf(makeListing());
    expect(form.roundToWholeUnit).toBe(true);
    expect(form.promotionId).toBeUndefined();
    expect(form.discountPercent).toBe("");
  });

  it("stages a new offer, carrying no promotion id", () => {
    const listing = makeListing();
    const form: OngoingPromotionForm = {
      ...ongoingPromotionFormOf(listing),
      discountPercent: "10",
    };
    expect(ongoingPromotionDraft(form, listing)).toEqual({
      kind: "EVERGREEN_PROMOTION",
      action: "UPSERT",
      offer: {
        promotionId: undefined,
        discountPercent: 10,
        minimumNights: 2,
        freeCleaning: false,
        roundToWholeUnit: true,
      },
    });
  });

  it("stages an edit against the saved offer's id and keeps its rounding", () => {
    const listing = makeListing({ promotions: [saved] });
    const form = {
      ...ongoingPromotionFormOf(listing),
      discountPercent: "20",
    };
    expect(ongoingPromotionDraft(form, listing)).toEqual({
      kind: "EVERGREEN_PROMOTION",
      action: "UPSERT",
      offer: {
        promotionId: "ongoing-1",
        discountPercent: 20,
        minimumNights: 3,
        freeCleaning: true,
        roundToWholeUnit: false,
      },
    });
  });

  it("stages a removal by the saved offer's own id", () => {
    const listing = makeListing({ promotions: [saved] });
    const form = { ...ongoingPromotionFormOf(listing), removing: true };
    expect(ongoingPromotionDraft(form, listing)).toEqual({
      kind: "EVERGREEN_PROMOTION",
      action: "REMOVE",
      promotionId: "ongoing-1",
    });
  });

  it("stages no removal when there is nothing saved to remove", () => {
    const listing = makeListing();
    const form = { ...ongoingPromotionFormOf(listing), removing: true };
    expect(ongoingPromotionDraft(form, listing)).toBeNull();
  });

  it("stages nothing for an offer that gives the guest nothing", () => {
    const listing = makeListing();
    const base = ongoingPromotionFormOf(listing);
    expect(
      ongoingPromotionDraft({ ...base, discountPercent: "0" }, listing),
    ).toBeNull();
    expect(ongoingPromotionDraft({ ...base, discountPercent: "" }, listing)).toBeNull();
  });

  it("stages nothing for an out-of-range or non-integer discount", () => {
    const listing = makeListing();
    const base = ongoingPromotionFormOf(listing);
    for (const discountPercent of ["-5", "51", "7.5", "abc"]) {
      expect(
        ongoingPromotionDraft({ ...base, discountPercent }, listing),
      ).toBeNull();
    }
  });

  it("stages nothing for an invalid minimum stay", () => {
    const listing = makeListing();
    const base = { ...ongoingPromotionFormOf(listing), discountPercent: "10" };
    for (const minimumNights of ["", "0", "2.5", "400"]) {
      expect(ongoingPromotionDraft({ ...base, minimumNights }, listing)).toBeNull();
    }
  });

  it("stages nothing for free cleaning on a listing with no cleaning fee", () => {
    const listing = makeListing({
      pricing: {
        currency: "EUR",
        baseNightlyRate: 120,
        cleaningFee: 0,
        minNights: 2,
        maxNights: 365,
      },
    });
    const form = {
      ...ongoingPromotionFormOf(listing),
      discountPercent: "0",
      freeCleaning: true,
    };
    expect(ongoingPromotionDraft(form, listing)).toBeNull();
  });

  it("treats rounding on a zero discount as the no-op it is", () => {
    // Rounding only means anything alongside a percentage, and it is normalized the
    // same way the review model normalizes it, so the two cannot disagree.
    const cleaningOnly = promotion({
      id: "ongoing-2",
      discountPercent: 0,
      freeCleaning: true,
      minimumNights: 2,
      roundToWholeUnit: false,
    });
    const listing = makeListing({ promotions: [cleaningOnly] });
    const form = { ...ongoingPromotionFormOf(listing), roundToWholeUnit: true };
    expect(ongoingPromotionDraft(form, listing)).toBeNull();
  });
});

/**
 * The whole path a listing-wide edit takes: form → staged change → review plan →
 * mutation step. Nothing between those is allowed to invent a value.
 */
describe("draft to review plan", () => {
  function planFor(listing: ReturnType<typeof makeListing>, change: ListingChange) {
    const index = buildListingCalendarIndex(listing);
    const counts = countDates(listing, index, TODAY, HORIZON_END);
    return buildListingReviewPlan({
      listing,
      index,
      change,
      summary: summarizeListingStatus({ listing, counts, horizonMonths: 18 }),
      today: TODAY,
      horizonEnd: HORIZON_END,
      horizonMonths: 18,
      now: new Date("2026-03-10T09:00:00.000Z"),
    });
  }

  it("gives the shell exactly one action, and one mutation behind it", () => {
    const listing = makeListing({ status: "APPROVED" });
    const drafts: ListingChange[] = [
      visibilityDraft({ field: "visibility", to: "HIDDEN" }, listing)!,
      visibilityDraft({ field: "mode", to: "CLOSED" }, listing)!,
      visibilityDraft({ field: "minNights", value: "4" }, listing)!,
      defaultsDraft(
        { ...defaultsFormOf(listing), baseNightlyRate: "150" },
        listing,
      )!,
      ongoingPromotionDraft(
        { ...ongoingPromotionFormOf(listing), discountPercent: "10" },
        listing,
      )!,
    ];
    for (const draft of drafts) {
      expect(draft).not.toBeNull();
      // One label, one plan, one step. A screen that could produce two of any of
      // these could save something the confirmation did not name.
      expect(typeof listingCtaFor(draft)).toBe("string");
      const plan = planFor(listing, draft);
      expect(plan.savable).toBe(true);
      expect(plan.steps).toHaveLength(1);
    }
  });

  it("leaves the action disabled for every no-op or invalid form", () => {
    // The shell enables Review exactly when the staged change is non-null, so this
    // is the whole of "disabled for no-op or invalid drafts".
    const listing = makeListing({ status: "APPROVED" });
    const stored = defaultsFormOf(listing);
    expect(visibilityDraft(null, listing)).toBeNull();
    expect(visibilityDraft({ field: "mode", to: "OPEN" }, listing)).toBeNull();
    expect(visibilityDraft({ field: "minNights", value: "2" }, listing)).toBeNull();
    expect(visibilityDraft({ field: "minNights", value: "x" }, listing)).toBeNull();
    expect(defaultsDraft(stored, listing)).toBeNull();
    expect(defaultsDraft({ ...stored, baseNightlyRate: "0" }, listing)).toBeNull();
    expect(
      ongoingPromotionDraft(ongoingPromotionFormOf(listing), listing),
    ).toBeNull();
  });

  it("merges a partial pricing edit only with the rule that was loaded", () => {
    const listing = makeListing();
    const draft = defaultsDraft(
      { ...defaultsFormOf(listing), baseNightlyRate: "150" },
      listing,
    )!;
    // The draft carries the one edited field...
    expect(draft).toEqual({
      kind: "DEFAULT_PRICING",
      to: { baseNightlyRate: 150 },
    });
    // ...and the review fills the rest from the canonical rule, not from the form.
    expect(planFor(listing, draft).steps).toEqual([
      {
        type: "SET_DEFAULT_PRICING",
        baseNightlyRate: 150,
        cleaningFee: 30,
        minNights: 2,
      },
    ]);
  });

  it("carries a saved offer's exact rounding all the way to the mutation", () => {
    const saved = promotion({
      id: "ongoing-1",
      discountPercent: 12,
      minimumNights: 3,
      freeCleaning: false,
      roundToWholeUnit: false,
    });
    const listing = makeListing({ promotions: [saved] });
    const draft = ongoingPromotionDraft(
      { ...ongoingPromotionFormOf(listing), discountPercent: "18" },
      listing,
    )!;
    expect(planFor(listing, draft).steps).toEqual([
      {
        type: "SAVE_EVERGREEN_PROMOTION",
        promotionId: "ongoing-1",
        discountPercent: 18,
        minimumNights: 3,
        freeCleaning: false,
        // Stored as `false` and still `false`; never defaulted to `true` on the way.
        roundToWholeUnit: false,
      },
    ]);
  });

  it("removes by the saved id, and says an ongoing offer is what ended", () => {
    const saved = promotion({ id: "ongoing-1" });
    const listing = makeListing({ promotions: [saved] });
    const draft = ongoingPromotionDraft(
      { ...ongoingPromotionFormOf(listing), removing: true },
      listing,
    )!;
    const plan = planFor(listing, draft);
    expect(listingCtaFor(draft)).toBe("REVIEW_PROMOTION_REMOVAL");
    expect(plan.steps).toEqual([
      { type: "REMOVE_PROMOTION", promotionId: "ongoing-1" },
    ]);
    expect(plan.consequences).toEqual([{ code: "EVERGREEN_PROMOTION_REMOVED" }]);
  });

  it("rebuilds the identical plan after a failed save", () => {
    // A rejected write leaves the editor and its draft exactly where they were, so
    // the retry has to describe the same change rather than a subtly different one.
    const listing = makeListing();
    const draft = defaultsDraft(
      { ...defaultsFormOf(listing), cleaningFee: "45" },
      listing,
    )!;
    expect(planFor(listing, draft)).toEqual(planFor(listing, draft));
  });

  it("counts as unsaved work, so leaving an editor has to ask first", () => {
    const listing = makeListing();
    const draft = defaultsDraft(
      { ...defaultsFormOf(listing), cleaningFee: "45" },
      listing,
    );
    const hasDraft = draft !== null;
    expect(hasDraft).toBe(true);
    // Back out of an editor holding this: prompt. Off the menu or the schedule list:
    // never, because neither can be holding one.
    expect(
      leavingLosesWork({ kind: "editor", editor: "listing_defaults" }, hasDraft),
    ).toBe(true);
    expect(leavingLosesWork(MENU_VIEW, hasDraft)).toBe(false);
    // Selecting dates takes the listing-wide editor off screen entirely.
    expect(
      viewAfterScopeChange(
        { kind: "editor", editor: "listing_defaults" },
        "DATES",
      ),
    ).toEqual(MENU_VIEW);
  });
});

describe("naming the single action", () => {
  it("names each listing-wide change, and removal apart from an edit", () => {
    expect(listingCtaFor({ kind: "VISIBILITY", to: "HIDDEN" })).toBe(
      "REVIEW_VISIBILITY",
    );
    expect(listingCtaFor({ kind: "AVAILABILITY_MODE", to: "CLOSED" })).toBe(
      "REVIEW_AVAILABILITY_RULE",
    );
    expect(listingCtaFor({ kind: "MIN_NIGHTS", to: 3 })).toBe("REVIEW_MIN_NIGHTS");
    expect(listingCtaFor({ kind: "DEFAULT_PRICING", to: {} })).toBe(
      "REVIEW_DEFAULTS",
    );
    expect(
      listingCtaFor({
        kind: "EVERGREEN_PROMOTION",
        action: "UPSERT",
        offer: {
          discountPercent: 10,
          minimumNights: 2,
          freeCleaning: false,
          roundToWholeUnit: true,
        },
      }),
    ).toBe("REVIEW_ONGOING_PROMOTION");
    expect(
      listingCtaFor({
        kind: "EVERGREEN_PROMOTION",
        action: "REMOVE",
        promotionId: "ongoing-1",
      }),
    ).toBe("REVIEW_PROMOTION_REMOVAL");
  });
});

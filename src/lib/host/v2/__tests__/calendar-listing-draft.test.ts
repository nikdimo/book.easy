import { describe, expect, it } from "vitest";
import {
  availabilityDefaultDraft,
  defaultsDraft,
  defaultsFormOf,
  listingCtaFor,
  ongoingPromotionDraft,
  ongoingPromotionFormOf,
  ongoingPromotionOf,
  type DefaultsForm,
  type OngoingPromotionForm,
} from "@/lib/host/v2/calendar-listing-draft";
import { buildListingCalendarIndex } from "@/lib/host/v2/calendar-model";
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

describe("default availability", () => {
  it("stages nothing until the answer differs from what is stored", () => {
    const open = makeListing({ availabilityMode: "OPEN" });
    expect(availabilityDefaultDraft(null, open)).toBeNull();
    expect(availabilityDefaultDraft("OPEN", open)).toBeNull();
  });

  it("stages the change in either direction", () => {
    const open = makeListing({ availabilityMode: "OPEN" });
    expect(availabilityDefaultDraft("CLOSED", open)).toEqual({
      kind: "AVAILABILITY_MODE",
      to: "CLOSED",
    });
    const closed = makeListing({ availabilityMode: "CLOSED" });
    expect(availabilityDefaultDraft("OPEN", closed)).toEqual({
      kind: "AVAILABILITY_MODE",
      to: "OPEN",
    });
  });

  it("says nothing about visibility, which is a different question elsewhere", () => {
    // A listing can be visible and unbookable, and it can have bookable dates while
    // nobody can find it. Nothing this function returns can change who sees the
    // listing, so the two controls cannot be confused for one another.
    const draft = availabilityDefaultDraft("CLOSED", makeListing({ status: "APPROVED" }));
    expect(draft).toEqual({ kind: "AVAILABILITY_MODE", to: "CLOSED" });
    expect(Object.keys(draft as object)).toEqual(["kind", "to"]);
  });

  it("does not depend on the listing having a price", () => {
    // Every listing has a stored default, priced or not, so this section is never
    // blocked on pricing the way the offer editor legitimately is.
    const listing = makeListing({ pricing: null, availabilityMode: "OPEN" });
    expect(availabilityDefaultDraft("CLOSED", listing)).toEqual({
      kind: "AVAILABILITY_MODE",
      to: "CLOSED",
    });
  });
});

describe("default pricing", () => {
  const listing = makeListing();
  const stored = defaultsFormOf(listing);

  it("reads the stored rule back as its own starting point", () => {
    expect(stored).toEqual({
      baseNightlyRate: "120",
      cleaningFee: "30",
    });
    expect(defaultsDraft(stored, listing)).toBeNull();
  });

  it("reads back money only, so no stay rule can be staged from Pricing", () => {
    // The form is the whole vocabulary of this screen. A `minNights` field here is what
    // let a Pricing tab resend the minimum it was rendered with over one changed since
    // under Availability → Booking rules.
    expect(Object.keys(stored).sort()).toEqual(["baseNightlyRate", "cleaningFee"]);
    expect(stored).not.toHaveProperty("minNights");
    expect(stored).not.toHaveProperty("maxNights");
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
  });

  it("cannot stage a stay limit even when one is forced into the form", () => {
    const smuggled = { ...stored, minNights: "4", maxNights: "9" } as never;
    // Unchanged amounts plus a stay limit is still no change at all: there is nothing
    // on this screen for a minimum stay to ride out on.
    expect(defaultsDraft(smuggled, listing)).toBeNull();

    const withPrice = {
      ...stored,
      baseNightlyRate: "150",
      minNights: "4",
      maxNights: "9",
    } as never;
    expect(defaultsDraft(withPrice, listing)).toEqual({
      kind: "DEFAULT_PRICING",
      to: { baseNightlyRate: 150 },
    });
  });

  it("carries several fields when several were edited, and no others", () => {
    const draft = defaultsDraft(
      { baseNightlyRate: "150", cleaningFee: "45" },
      listing,
    );
    expect(draft).toEqual({
      kind: "DEFAULT_PRICING",
      to: { baseNightlyRate: 150, cleaningFee: 45 },
    });
    // Two amounts, and no stay rule riding along with them.
    const keys = Object.keys((draft as { to: Record<string, number> }).to);
    expect(keys).not.toContain("minNights");
    expect(keys).not.toContain("maxNights");
  });

  it("stages nothing for an invalid or half-typed value", () => {
    const invalid: DefaultsForm[] = [
      { ...stored, baseNightlyRate: "" },
      { ...stored, baseNightlyRate: "0" },
      { ...stored, baseNightlyRate: "abc" },
      { ...stored, cleaningFee: "" },
      { ...stored, cleaningFee: "-5" },
    ];
    for (const form of invalid) expect(defaultsDraft(form, listing)).toBeNull();
  });

  it("stages nothing without a loaded rule to merge the untouched fields with", () => {
    const unpriced = makeListing({ pricing: null });
    expect(
      defaultsDraft({ baseNightlyRate: "150", cleaningFee: "20" }, unpriced),
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
    return buildListingReviewPlan({
      listing,
      index,
      change,
      today: TODAY,
      horizonEnd: HORIZON_END,
      horizonMonths: 18,
    });
  }

  it("gives the shell exactly one action, and one mutation behind it", () => {
    const listing = makeListing({ status: "APPROVED" });
    const drafts: ListingChange[] = [
      availabilityDefaultDraft("CLOSED", listing)!,
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
    expect(availabilityDefaultDraft(null, listing)).toBeNull();
    expect(availabilityDefaultDraft("OPEN", listing)).toBeNull();
    expect(defaultsDraft(stored, listing)).toBeNull();
    expect(defaultsDraft({ ...stored, baseNightlyRate: "0" }, listing)).toBeNull();
    expect(defaultsDraft({ ...stored, cleaningFee: "-1" }, listing)).toBeNull();
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
      leavingLosesWork({ kind: "editor", editor: "pricing" }, hasDraft),
    ).toBe(true);
    expect(leavingLosesWork(MENU_VIEW, hasDraft)).toBe(false);
    // Clearing the dates takes a date editor off screen entirely — the calendar has
    // no editor left that a cleared selection could leave pointing at nothing.
    expect(
      viewAfterScopeChange({ kind: "editor", editor: "pricing" }, "ALL_FUTURE"),
    ).toEqual(MENU_VIEW);
  });
});

describe("naming the single action", () => {
  it("names each listing-wide change, and removal apart from an edit", () => {
    expect(listingCtaFor({ kind: "AVAILABILITY_MODE", to: "CLOSED" })).toBe(
      "REVIEW_AVAILABILITY_RULE",
    );
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

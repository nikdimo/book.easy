import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import {
  countManualBlockedDates,
  selectionExactManualBlock,
  simulateAvailabilityModeChange,
  summarizeSelectionAvailability,
  summarizeSelectionPrices,
  type ListingCalendarIndex,
} from "@/lib/host/v2/calendar-model";
import {
  isPublishableStatus,
  type ListingSaleBlocker,
} from "@/lib/host/v2/listing-status";
import {
  selectionContainsPastDate,
  selectionDates,
  selectionRange,
  type CalendarSelection,
} from "@/lib/host/v2/calendar-selection";
import {
  promotionSaveMode,
  resolveSelectionPromotion,
  type ProposedNightlyRate,
  type ProposedPromotion,
  type PromotionSaveMode,
} from "@/lib/host/v2/calendar-quote";

/**
 * Nothing in this module talks to the database. It turns "what the host typed" into
 * "what will be sent, what will change, and what happens next", so the review screen
 * can be checked in a test and so a half-finished edit can never reach a server action
 * — an invalid draft produces zero steps rather than a partial save.
 *
 * **One change per review.** A plan carries exactly one mutation. The services behind
 * these actions each own their own transaction and there is no shared one to enrol them
 * in, so a review promising "availability *and* price" could only ever have been two
 * sequential writes — with a window where the first had landed, the second had failed,
 * and the screen still showed the host's draft. Rather than imply an atomicity that
 * does not exist, the editor commits one thing at a time.
 */

/** The single pending change to the selected dates. */
export type DateChange =
  | {
      kind: "AVAILABILITY";
      to: "OPEN" | "BLOCK";
      /**
       * The host's own note on why these dates are blocked. Optional, private, and
       * meaningful only when blocking — opening a date removes the block the note was
       * attached to, so a note carried into an "open" change would describe nothing.
       */
      note?: string | null;
    }
  | { kind: "PRICE"; to: ProposedNightlyRate }
  | { kind: "PROMOTION"; offer: ProposedPromotion }
  /**
   * Take a saved date-specific offer off these dates entirely.
   *
   * Kept apart from `PROMOTION` because the two are different acts with different
   * consequences, and the scheduled-changes list offers them as different buttons:
   * one rewrites an offer, the other ends it. Removing an *unsaved* draft is not this
   * — that never reached the database and needs no review at all.
   */
  | { kind: "PROMOTION_REMOVE"; promotionId: string };

/**
 * Listing-level changes are reviewed and saved one at a time, never folded into a date
 * edit: "block these dates" and "hide the whole listing" are different promises to the
 * guest and deserve separate consequences.
 */
export type ListingChange =
  | { kind: "AVAILABILITY_MODE"; to: "OPEN" | "CLOSED" }
  | {
      kind: "DEFAULT_PRICING";
      /**
       * Only the fields the host actually edited need to be supplied. The review
       * model fills every omitted field from the current rule before it creates the
       * one whole-rule mutation required by `saveCalendarDefaultPricing`.
       */
      to: {
        baseNightlyRate?: number;
        cleaningFee?: number;
        minNights?: number;
      };
    }
  | {
      kind: "EVERGREEN_PROMOTION";
      action: "UPSERT";
      /** Omit `promotionId` to create; include it to edit one existing offer. */
      offer: ProposedPromotion;
    }
  | {
      kind: "EVERGREEN_PROMOTION";
      action: "REMOVE";
      promotionId: string;
    };

export type MutationStep =
  | { type: "OPEN_RANGE"; startDate: string; endDate: string }
  | {
      type: "BLOCK_RANGE";
      startDate: string;
      endDate: string;
      /** Stored as the block's `reason`. Host-only; nothing guest-facing reads it. */
      note?: string | null;
    }
  | {
      type: "SET_DATE_PRICE";
      startDate: string;
      endDate: string;
      nightlyRate: number;
    }
  | { type: "CLEAR_DATE_PRICE"; startDate: string; endDate: string }
  | {
      type: "SAVE_PROMOTION";
      startDate: string;
      endDate: string;
      promotionId?: string;
      discountPercent: number;
      minimumNights: number;
      freeCleaning: boolean;
      roundToWholeUnit: boolean;
    }
  | { type: "SET_AVAILABILITY_MODE"; mode: "OPEN" | "CLOSED" }
  | {
      type: "SET_DEFAULT_PRICING";
      baseNightlyRate: number;
      cleaningFee: number;
      minNights: number;
    }
  | {
      type: "SAVE_EVERGREEN_PROMOTION";
      promotionId?: string;
      discountPercent: number;
      minimumNights: number;
      freeCleaning: boolean;
      roundToWholeUnit: boolean;
    }
  | { type: "REMOVE_PROMOTION"; promotionId: string };

export type ReviewValue =
  | { code: "AVAILABILITY_AVAILABLE"; dates: number }
  | { code: "AVAILABILITY_OPEN_NOT_BOOKABLE"; dates: number }
  | { code: "AVAILABILITY_BLOCKED"; dates: number }
  | { code: "AVAILABILITY_BOOKED"; dates: number }
  | {
      code: "AVAILABILITY_MIXED";
      available: number;
      openNotBookable: number;
      blocked: number;
      booked: number;
    }
  | { code: "PRICE_SINGLE"; amount: number }
  | { code: "PRICE_RANGE"; min: number; max: number }
  | { code: "PRICE_BASE"; amount: number }
  | { code: "MONEY"; amount: number }
  | { code: "PROMOTION_NONE" }
  | {
      code: "PROMOTION_OFFER";
      discountPercent: number;
      freeCleaning: boolean;
      minimumNights: number;
      /** Required so every host-facing promotion summary states the saved rule. */
      roundToWholeUnit: boolean;
      /** True when this offer runs on every date, not only the selected ones. */
      evergreen: boolean;
    }
  | { code: "MODE_OPEN" }
  | { code: "MODE_CLOSED" }
  | { code: "NIGHTS"; nights: number }
  | { code: "NOTE_NONE" }
  /** The host's own words, shown back verbatim and never translated. */
  | { code: "NOTE_TEXT"; note: string };

export type ReviewField =
  | "availability"
  | "block_note"
  | "price"
  | "promotion"
  | "availability_mode"
  | "base_price"
  | "cleaning_fee"
  | "min_nights";

export interface ReviewRow {
  field: ReviewField;
  before: ReviewValue;
  after: ReviewValue;
}

export type Consequence =
  | {
      code: "DATES_OPENED";
      dates: number;
      /** Of `dates`, how many a guest could then actually book. */
      bookable: number;
      lockedDates: number;
      saleBlockers: ListingSaleBlocker[];
    }
  | {
      code: "DATES_CLOSED";
      dates: number;
      bookable: number;
      bookedDates: number;
    }
  | {
      code: "BLOCK_NOTE_SAVED";
      /** Dates the note is actually written onto — the ones being blocked now. */
      dates: number;
      /**
       * Dates in the range a manual block already covers. Their own note is left
       * exactly as it was, because the canonical block service creates blocks for the
       * gaps and never rewrites an existing one. Stated rather than glossed over.
       */
      keptOnExisting: number;
    }
  | { code: "PRICE_APPLIES"; dates: number; sellable: boolean }
  | { code: "PRICE_RESET"; dates: number }
  | {
      code: "PROMOTION_APPLIES";
      dates: number;
      mode: PromotionSaveMode;
      sellable: boolean;
    }
  | {
      code: "MODE_TO_OPEN";
      becomingOpen: number;
      becomingBookable: number;
      stayingBlocked: number;
      saleBlockers: ListingSaleBlocker[];
      horizonMonths: number;
    }
  | {
      code: "MODE_TO_CLOSED";
      closing: number;
      losingBookability: number;
      stayingOpenViaWindows: number;
      horizonMonths: number;
    }
  | { code: "BASE_PRICE_FALLBACK"; amount: number }
  | {
      code: "CLEANING_FEE_ALL_STAYS";
      amount: number;
      freeCleaningBenefitsRemoved: number;
    }
  | { code: "MIN_NIGHTS_ALL_DATES"; minNights: number }
  | { code: "EVERGREEN_PROMOTION_SAVED"; mode: "CREATE" | "EDIT" }
  | { code: "EVERGREEN_PROMOTION_REMOVED" }
  | {
      code: "DATE_PROMOTION_REMOVED";
      /** Whether an always-active offer is left behind to take these dates over. */
      fallsBackToOngoing: boolean;
    };

export type SaveAction =
  | "SAVE_AND_OPEN"
  | "SAVE_AND_BLOCK"
  | "SAVE_PRICE"
  | "SAVE_PROMOTION"
  | "SAVE_MODE_OPEN"
  | "SAVE_MODE_CLOSED"
  | "SAVE_DEFAULT_PRICING"
  | "SAVE_EVERGREEN_PROMOTION"
  | "REMOVE_EVERGREEN_PROMOTION"
  | "REMOVE_DATE_PROMOTION";

export type ReviewError =
  | { code: "NO_SELECTION" }
  | { code: "NO_CHANGES" }
  | { code: "PAST_DATE" }
  | { code: "NO_PRICING" }
  | { code: "INVALID_PRICE" }
  | { code: "INVALID_CLEANING_FEE" }
  | { code: "INVALID_PROMOTION" }
  | { code: "FREE_CLEANING_WITHOUT_FEE" }
  | { code: "PROMOTION_REQUIRES_LIVE" }
  | { code: "NOTHING_TO_OPEN" }
  | { code: "NOTHING_TO_BLOCK" }
  /**
   * The host changed the note on a range that is already entirely blocked.
   *
   * `blockRangeForManagedListing` writes a note only onto the blocks it creates for
   * the still-open gaps in a range; it has no path that rewrites the `reason` of a
   * block that already exists. With nothing to create, saving would report success and
   * change nothing, so the review refuses instead of pretending. Fixing it means giving
   * the canonical service an explicit "update this block's note" operation — not
   * reaching around it from here.
   */
  | { code: "INVALID_MIN_NIGHTS"; maxNights: number }
  | { code: "MODE_UNCHANGED" }
  | { code: "PROMOTION_NOT_FOUND" }
  | { code: "PROMOTION_NOT_EVERGREEN" }
  /**
   * The date scope was asked to remove an offer that runs on every date.
   *
   * Refused rather than honoured: the host is looking at three nights, and ending an
   * always-active offer from here would quietly change every other date too. The
   * all-dates editor owns that decision and says so.
   */
  | { code: "PROMOTION_NOT_DATED" }
  | { code: "PROMOTION_CONFLICT"; minimumNights: number };

export interface ReviewPlan {
  rows: ReviewRow[];
  consequences: Consequence[];
  /** At most one. See the note on one change per review. */
  steps: MutationStep[];
  errors: ReviewError[];
  saveAction: SaveAction;
  /** The only thing the save button should ever check. */
  savable: boolean;
}

function plan(partial: Omit<ReviewPlan, "savable">): ReviewPlan {
  // Fail closed in one place: if anything about the draft is wrong, the plan carries
  // no steps at all, so a caller that ignores `errors` still cannot half-save.
  const clean = partial.errors.length === 0;
  return {
    ...partial,
    steps: clean ? partial.steps : [],
    savable: clean && partial.steps.length > 0,
  };
}

function availabilityValue(summary: {
  available: number;
  openNotBookable: number;
  blocked: number;
  booked: number;
}): ReviewValue {
  const present = [
    summary.available > 0,
    summary.openNotBookable > 0,
    summary.blocked > 0,
    summary.booked > 0,
  ].filter(Boolean).length;
  if (present > 1) {
    return {
      code: "AVAILABILITY_MIXED",
      available: summary.available,
      openNotBookable: summary.openNotBookable,
      blocked: summary.blocked,
      booked: summary.booked,
    };
  }
  if (summary.booked > 0) {
    return { code: "AVAILABILITY_BOOKED", dates: summary.booked };
  }
  if (summary.blocked > 0) {
    return { code: "AVAILABILITY_BLOCKED", dates: summary.blocked };
  }
  if (summary.openNotBookable > 0) {
    return {
      code: "AVAILABILITY_OPEN_NOT_BOOKABLE",
      dates: summary.openNotBookable,
    };
  }
  return { code: "AVAILABILITY_AVAILABLE", dates: summary.available };
}

function promotionValue(
  listing: HostCalendarListing,
  selection: CalendarSelection,
): { value: ReviewValue; existingId?: string; mode: PromotionSaveMode } {
  const existing = resolveSelectionPromotion(listing, selection);
  const mode = promotionSaveMode(existing, selection);
  if (!existing) return { value: { code: "PROMOTION_NONE" }, mode };
  return {
    value: {
      code: "PROMOTION_OFFER",
      discountPercent: existing.discountPercent,
      freeCleaning: existing.freeCleaning,
      minimumNights:
        existing.minimumNights ?? listing.pricing?.minNights ?? 1,
      roundToWholeUnit: existing.roundToWholeUnit,
      evergreen: !existing.startDate && !existing.endDate,
    },
    existingId: existing.id,
    mode,
  };
}

function isPositiveInteger(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= max;
}

function promotionReviewValue(
  listing: HostCalendarListing,
  promotion: HostCalendarListing["promotions"][number],
): ReviewValue {
  return {
    code: "PROMOTION_OFFER",
    discountPercent: promotion.discountPercent,
    freeCleaning: promotion.freeCleaning,
    minimumNights:
      promotion.minimumNights ?? listing.pricing?.minNights ?? 1,
    roundToWholeUnit: promotion.roundToWholeUnit,
    evergreen: !promotion.startDate && !promotion.endDate,
  };
}

function buildDefaultPricingReviewPlan(
  listing: HostCalendarListing,
  change: Extract<ListingChange, { kind: "DEFAULT_PRICING" }>,
): ReviewPlan {
  const saveAction: SaveAction = "SAVE_DEFAULT_PRICING";
  const pricing = listing.pricing;
  if (!pricing) {
    return plan({
      rows: [],
      consequences: [],
      steps: [],
      errors: [{ code: "NO_PRICING" }],
      saveAction,
    });
  }

  // The canonical action writes the whole rule. Resolve omitted values only from the
  // rule we actually loaded; never substitute zeroes or UI defaults for untouched data.
  const next = {
    baseNightlyRate:
      change.to.baseNightlyRate === undefined
        ? pricing.baseNightlyRate
        : change.to.baseNightlyRate,
    cleaningFee:
      change.to.cleaningFee === undefined
        ? pricing.cleaningFee
        : change.to.cleaningFee,
    minNights:
      change.to.minNights === undefined
        ? pricing.minNights
        : change.to.minNights,
  };
  const changed = {
    baseNightlyRate: next.baseNightlyRate !== pricing.baseNightlyRate,
    cleaningFee: next.cleaningFee !== pricing.cleaningFee,
    minNights: next.minNights !== pricing.minNights,
  };
  const errors: ReviewError[] = [];
  if (!Number.isFinite(next.baseNightlyRate) || next.baseNightlyRate < 1) {
    errors.push({ code: "INVALID_PRICE" });
  }
  if (!Number.isFinite(next.cleaningFee) || next.cleaningFee < 0) {
    errors.push({ code: "INVALID_CLEANING_FEE" });
  }
  if (!isPositiveInteger(next.minNights, pricing.maxNights)) {
    errors.push({ code: "INVALID_MIN_NIGHTS", maxNights: pricing.maxNights });
  }
  if (!Object.values(changed).some(Boolean)) {
    errors.push({ code: "NO_CHANGES" });
  }

  const rows: ReviewRow[] = [];
  const consequences: Consequence[] = [];
  if (changed.baseNightlyRate) {
    rows.push({
      field: "base_price",
      before: { code: "PRICE_BASE", amount: pricing.baseNightlyRate },
      after: { code: "PRICE_BASE", amount: next.baseNightlyRate },
    });
    consequences.push({
      code: "BASE_PRICE_FALLBACK",
      amount: next.baseNightlyRate,
    });
  }
  if (changed.cleaningFee) {
    rows.push({
      field: "cleaning_fee",
      before: { code: "MONEY", amount: pricing.cleaningFee },
      after: { code: "MONEY", amount: next.cleaningFee },
    });
    consequences.push({
      code: "CLEANING_FEE_ALL_STAYS",
      amount: next.cleaningFee,
      // `saveDefaultPricingForManagedListing` removes this benefit in the same
      // transaction when the fee becomes zero. The payload contains active offers.
      freeCleaningBenefitsRemoved:
        next.cleaningFee === 0
          ? listing.promotions.filter((promotion) => promotion.freeCleaning).length
          : 0,
    });
  }
  if (changed.minNights) {
    rows.push({
      field: "min_nights",
      before: { code: "NIGHTS", nights: pricing.minNights },
      after: { code: "NIGHTS", nights: next.minNights },
    });
    consequences.push({
      code: "MIN_NIGHTS_ALL_DATES",
      minNights: next.minNights,
    });
  }

  return plan({
    rows,
    consequences,
    steps: [{ type: "SET_DEFAULT_PRICING", ...next }],
    errors,
    saveAction,
  });
}

function buildEvergreenPromotionReviewPlan(
  listing: HostCalendarListing,
  change: Extract<ListingChange, { kind: "EVERGREEN_PROMOTION" }>,
): ReviewPlan {
  const saveAction: SaveAction =
    change.action === "REMOVE"
      ? "REMOVE_EVERGREEN_PROMOTION"
      : "SAVE_EVERGREEN_PROMOTION";
  const pricing = listing.pricing;
  const errors: ReviewError[] = [];
  if (!pricing) errors.push({ code: "NO_PRICING" });
  if (listing.status !== "APPROVED") {
    errors.push({ code: "PROMOTION_REQUIRES_LIVE" });
  }

  const promotionId =
    change.action === "REMOVE" ? change.promotionId : change.offer.promotionId;
  const existing = promotionId
    ? listing.promotions.find((promotion) => promotion.id === promotionId)
    : undefined;
  if (promotionId && !existing) errors.push({ code: "PROMOTION_NOT_FOUND" });
  if (existing && (existing.startDate || existing.endDate)) {
    // Turning a date-specific offer into an always-active one is a scope change the
    // listing-wide editor must never perform accidentally.
    errors.push({ code: "PROMOTION_NOT_EVERGREEN" });
  }

  if (change.action === "REMOVE") {
    const isEvergreen = Boolean(
      existing && !existing.startDate && !existing.endDate,
    );
    return plan({
      rows: existing
        ? [
            {
              field: "promotion",
              before: promotionReviewValue(listing, existing),
              after: { code: "PROMOTION_NONE" },
            },
          ]
        : [],
      consequences: isEvergreen
        ? [{ code: "EVERGREEN_PROMOTION_REMOVED" }]
        : [],
      steps: [{ type: "REMOVE_PROMOTION", promotionId: change.promotionId }],
      errors,
      saveAction,
    });
  }

  const offer = change.offer;
  const normalizedRoundToWholeUnit =
    offer.discountPercent > 0 && offer.roundToWholeUnit;
  if (pricing) {
    if (
      !Number.isInteger(offer.discountPercent) ||
      offer.discountPercent < 0 ||
      offer.discountPercent > 50 ||
      (offer.discountPercent === 0 && !offer.freeCleaning) ||
      !isPositiveInteger(offer.minimumNights, pricing.maxNights)
    ) {
      errors.push({ code: "INVALID_PROMOTION" });
    } else if (offer.freeCleaning && pricing.cleaningFee <= 0) {
      errors.push({ code: "FREE_CLEANING_WITHOUT_FEE" });
    }
  }

  const targetCanBeSaved =
    !promotionId || Boolean(existing && !existing.startDate && !existing.endDate);

  if (
    existing &&
    !existing.startDate &&
    !existing.endDate &&
    existing.discountPercent === offer.discountPercent &&
    existing.freeCleaning === offer.freeCleaning &&
    (existing.minimumNights ?? pricing?.minNights ?? 1) === offer.minimumNights &&
    existing.roundToWholeUnit === normalizedRoundToWholeUnit
  ) {
    errors.push({ code: "NO_CHANGES" });
  }

  return plan({
    rows: [
      {
        field: "promotion",
        before: existing
          ? promotionReviewValue(listing, existing)
          : { code: "PROMOTION_NONE" },
        after: {
          code: "PROMOTION_OFFER",
          discountPercent: offer.discountPercent,
          freeCleaning: offer.freeCleaning,
          minimumNights: offer.minimumNights,
          roundToWholeUnit: normalizedRoundToWholeUnit,
          evergreen: true,
        },
      },
    ],
    consequences: targetCanBeSaved
      ? [
          {
            code: "EVERGREEN_PROMOTION_SAVED",
            mode: promotionId ? "EDIT" : "CREATE",
          },
        ]
      : [],
    steps: [
      {
        type: "SAVE_EVERGREEN_PROMOTION",
        promotionId: offer.promotionId,
        discountPercent: offer.discountPercent,
        minimumNights: offer.minimumNights,
        freeCleaning: offer.freeCleaning,
        roundToWholeUnit: normalizedRoundToWholeUnit,
      },
    ],
    errors,
    saveAction,
  });
}

/** Review model for the one pending change scoped to the selected dates. */
export function buildDateReviewPlan({
  listing,
  index,
  selection,
  change,
  today,
}: {
  listing: HostCalendarListing;
  index: ListingCalendarIndex;
  selection: CalendarSelection | null;
  change: DateChange | null;
  today: string;
}): ReviewPlan {
  const saveAction: SaveAction =
    change?.kind === "AVAILABILITY"
      ? change.to === "OPEN"
        ? "SAVE_AND_OPEN"
        : "SAVE_AND_BLOCK"
      : change?.kind === "PROMOTION"
        ? "SAVE_PROMOTION"
        : change?.kind === "PROMOTION_REMOVE"
          ? "REMOVE_DATE_PROMOTION"
          : "SAVE_PRICE";

  if (!selection) {
    return plan({
      rows: [],
      consequences: [],
      steps: [],
      errors: [{ code: "NO_SELECTION" }],
      saveAction,
    });
  }
  if (!change) {
    return plan({
      rows: [],
      consequences: [],
      steps: [],
      errors: [{ code: "NO_CHANGES" }],
      saveAction,
    });
  }

  const errors: ReviewError[] = [];
  if (selectionContainsPastDate(selection, today)) {
    errors.push({ code: "PAST_DATE" });
  }

  const dates = selectionDates(selection);
  const { startDate, endDate } = selectionRange(selection);
  const availability = summarizeSelectionAvailability(
    listing,
    index,
    dates,
    today,
  );
  const sellable = availability.saleBlockers.length === 0;

  if (change.kind === "AVAILABILITY") {
    if (change.to === "OPEN") {
      if (availability.openable === 0) errors.push({ code: "NOTHING_TO_OPEN" });
      return plan({
        rows: [
          {
            field: "availability",
            before: availabilityValue(availability),
            after: sellable
              ? {
                  code: "AVAILABILITY_AVAILABLE",
                  dates: availability.available + availability.openable,
                }
              : {
                  code: "AVAILABILITY_OPEN_NOT_BOOKABLE",
                  dates: availability.openNotBookable + availability.openable,
                },
          },
        ],
        consequences: [
          {
            code: "DATES_OPENED",
            dates: availability.openable,
            bookable: sellable ? availability.openable : 0,
            lockedDates: availability.locked,
            saleBlockers: availability.saleBlockers,
          },
        ],
        steps: [{ type: "OPEN_RANGE", startDate, endDate }],
        errors,
        saveAction,
      });
    }

    // The host's private note. Trimmed to one truth: an empty field and a field of
    // spaces both mean "no note", so neither can be saved as one.
    // CLOSED mode has no manual block to attach a note to: closing removes an explicit
    // open window. Never review or promise a note in that mode.
    const supportsBlockNote = listing.availabilityMode === "OPEN";
    const note = supportsBlockNote ? (change.note?.trim() ?? "") : "";
    const exactManualBlock = supportsBlockNote
      ? selectionExactManualBlock(listing, selection)
      : null;
    const storedNote = exactManualBlock?.reason?.trim() || null;
    const noteChanged = note !== (storedNote ?? "");
    const alreadyBlocked = countManualBlockedDates(index, dates);

    if (
      availability.blockable === 0 &&
      !(exactManualBlock && noteChanged)
    ) {
      errors.push({ code: "NOTHING_TO_BLOCK" });
    }

    const rows: ReviewRow[] = [];
    if (availability.blockable > 0) {
      rows.push({
        field: "availability",
        before: availabilityValue(availability),
        after: {
          code: "AVAILABILITY_BLOCKED",
          dates: availability.blocked + availability.blockable,
        },
      });
    }
    // Only shown when there is a note in play at all, so a plain block review is not
    // padded with a row saying "no note" became "no note".
    if (note !== "" || storedNote !== null) {
      rows.push({
        field: "block_note",
        before: storedNote
          ? { code: "NOTE_TEXT", note: storedNote }
          : { code: "NOTE_NONE" },
        after: note ? { code: "NOTE_TEXT", note } : { code: "NOTE_NONE" },
      });
    }

    const consequences: Consequence[] = [];
    if (availability.blockable > 0) {
      consequences.push({
        code: "DATES_CLOSED",
        dates: availability.blockable,
        bookable: availability.available,
        bookedDates: availability.booked,
      });
    }
    if (supportsBlockNote && noteChanged) {
      consequences.push({
        code: "BLOCK_NOTE_SAVED",
        dates: availability.blockable + alreadyBlocked,
        keptOnExisting: 0,
      });
    }

    const noteMutation =
      supportsBlockNote && noteChanged
        ? note || null
        : note
          ? note
          : undefined;

    return plan({
      rows,
      consequences,
      steps: [
        { type: "BLOCK_RANGE", startDate, endDate, note: noteMutation },
      ],
      errors,
      saveAction,
    });
  }

  // Ending a saved date-specific offer. Deliberately ahead of the pricing check: a
  // listing whose pricing rule has gone missing can still have an offer running, and
  // refusing to take it off would leave the host with no way to stop it.
  if (change.kind === "PROMOTION_REMOVE") {
    const existing = listing.promotions.find(
      (promotion) => promotion.id === change.promotionId,
    );
    if (!existing) errors.push({ code: "PROMOTION_NOT_FOUND" });
    else if (!existing.startDate && !existing.endDate) {
      errors.push({ code: "PROMOTION_NOT_DATED" });
    }

    // What a guest would get once this offer is gone. Asked of the listing without it
    // rather than assumed to be "nothing", because an always-active offer sitting
    // underneath takes these dates over the moment the dated one stops.
    const withoutIt: HostCalendarListing = {
      ...listing,
      promotions: listing.promotions.filter(
        (promotion) => promotion.id !== change.promotionId,
      ),
    };
    const fallback = resolveSelectionPromotion(withoutIt, selection);

    return plan({
      rows: existing
        ? [
            {
              field: "promotion",
              before: promotionReviewValue(listing, existing),
              after: fallback
                ? promotionReviewValue(listing, fallback)
                : { code: "PROMOTION_NONE" },
            },
          ]
        : [],
      consequences: [
        {
          code: "DATE_PROMOTION_REMOVED",
          fallsBackToOngoing: Boolean(fallback),
        },
      ],
      steps: [{ type: "REMOVE_PROMOTION", promotionId: change.promotionId }],
      errors,
      saveAction,
    });
  }

  if (!listing.pricing) {
    errors.push({ code: "NO_PRICING" });
    return plan({
      rows: [],
      consequences: [],
      steps: [],
      errors,
      saveAction,
    });
  }
  const pricing = listing.pricing;

  if (change.kind === "PRICE") {
    const prices = summarizeSelectionPrices(listing, index, dates);
    const before: ReviewValue = prices.mixed
      ? { code: "PRICE_RANGE", min: prices.min ?? 0, max: prices.max ?? 0 }
      : { code: "PRICE_SINGLE", amount: prices.min ?? 0 };

    if (change.to?.mode === "SET") {
      const value = change.to.value;
      if (!Number.isFinite(value) || value <= 0) {
        errors.push({ code: "INVALID_PRICE" });
      }
      return plan({
        rows: [
          {
            field: "price",
            before,
            after: { code: "PRICE_SINGLE", amount: value },
          },
        ],
        consequences: [
          { code: "PRICE_APPLIES", dates: dates.length, sellable },
        ],
        steps: [
          { type: "SET_DATE_PRICE", startDate, endDate, nightlyRate: value },
        ],
        errors,
        saveAction,
      });
    }

    return plan({
      rows: [
        {
          field: "price",
          before,
          after: { code: "PRICE_BASE", amount: pricing.baseNightlyRate },
        },
      ],
      consequences: [{ code: "PRICE_RESET", dates: dates.length }],
      steps: [{ type: "CLEAR_DATE_PRICE", startDate, endDate }],
      errors,
      saveAction,
    });
  }

  const offer = change.offer;
  const existing = promotionValue(listing, selection);

  const validPercent =
    Number.isInteger(offer.discountPercent) &&
    offer.discountPercent >= 0 &&
    offer.discountPercent <= 50;
  const hasBenefit = offer.discountPercent > 0 || offer.freeCleaning;
  const validMinimum = isPositiveInteger(offer.minimumNights, pricing.maxNights);
  if (!validPercent || !hasBenefit || !validMinimum) {
    errors.push({ code: "INVALID_PROMOTION" });
  } else if (offer.freeCleaning && pricing.cleaningFee <= 0) {
    errors.push({ code: "FREE_CLEANING_WITHOUT_FEE" });
  } else if (listing.status !== "APPROVED") {
    // Mirrors `savePromotionForManagedListing`, which refuses offers on a listing
    // that is not live. Catching it here means the host sees why before saving.
    errors.push({ code: "PROMOTION_REQUIRES_LIVE" });
  }

  return plan({
    rows: [
      {
        field: "promotion",
        before: existing.value,
        after: {
          code: "PROMOTION_OFFER",
          discountPercent: offer.discountPercent,
          freeCleaning: offer.freeCleaning,
          minimumNights: offer.minimumNights,
          roundToWholeUnit: offer.roundToWholeUnit,
          evergreen: false,
        },
      },
    ],
    consequences: [
      {
        code: "PROMOTION_APPLIES",
        dates: dates.length,
        mode: existing.mode,
        sellable,
      },
    ],
    steps: [
      {
        type: "SAVE_PROMOTION",
        startDate,
        endDate,
        // Only an offer whose own dates are exactly this range is edited in place.
        // Anything else is a new date-specific offer that takes priority here and
        // leaves the existing one running everywhere else.
        promotionId: existing.mode === "EDIT" ? existing.existingId : undefined,
        discountPercent: offer.discountPercent,
        minimumNights: offer.minimumNights,
        freeCleaning: offer.freeCleaning,
        roundToWholeUnit: offer.roundToWholeUnit,
      },
    ],
    errors,
    saveAction,
  });
}

/** Review model for a change that affects the whole listing, never a date range. */
export function buildListingReviewPlan({
  listing,
  index,
  change,
  today,
  horizonEnd,
  horizonMonths,
}: {
  listing: HostCalendarListing;
  index: ListingCalendarIndex;
  change: ListingChange;
  today: string;
  horizonEnd: string;
  horizonMonths: number;
}): ReviewPlan {
  if (change.kind === "AVAILABILITY_MODE") {
    const saveAction: SaveAction =
      change.to === "OPEN" ? "SAVE_MODE_OPEN" : "SAVE_MODE_CLOSED";
    if (change.to === listing.availabilityMode) {
      return plan({
        rows: [],
        consequences: [],
        steps: [],
        errors: [{ code: "MODE_UNCHANGED" }],
        saveAction,
      });
    }
    const transition = simulateAvailabilityModeChange(
      listing,
      index,
      change.to,
      today,
      horizonEnd,
    );
    const toOpen = change.to === "OPEN";
    return plan({
      rows: [
        {
          field: "availability_mode",
          before: toOpen ? { code: "MODE_CLOSED" } : { code: "MODE_OPEN" },
          after: toOpen ? { code: "MODE_OPEN" } : { code: "MODE_CLOSED" },
        },
      ],
      consequences: [
        toOpen
          ? {
              code: "MODE_TO_OPEN",
              becomingOpen: transition.becomingOpen,
              becomingBookable: transition.becomingBookable,
              stayingBlocked: transition.stayingBlocked,
              saleBlockers: transition.saleBlockers,
              horizonMonths,
            }
          : {
              code: "MODE_TO_CLOSED",
              closing: transition.closing,
              losingBookability: transition.losingBookability,
              stayingOpenViaWindows: transition.stayingOpenViaWindows,
              horizonMonths,
            },
      ],
      steps: [{ type: "SET_AVAILABILITY_MODE", mode: change.to }],
      errors: [],
      saveAction,
    });
  }

  if (change.kind === "DEFAULT_PRICING") {
    return buildDefaultPricingReviewPlan(listing, change);
  }

  return buildEvergreenPromotionReviewPlan(listing, change);
}

export { isPublishableStatus };

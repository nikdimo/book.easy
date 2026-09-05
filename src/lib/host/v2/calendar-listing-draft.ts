/**
 * What the listing-wide editors have typed, and the single change it amounts to.
 *
 * The date editors already work this way: the calendar panel holds one
 * `DateChange | null`, its Review button is enabled exactly when that is non-null, and
 * the review model turns it into steps. The listing-wide editors used to be the
 * exception — each card raised its own review from a button inside itself — so the
 * shell had no idea whether there was anything to save and could not own the action.
 *
 * This module closes that gap. It converts form state into `ListingChange | null`, and
 * `null` means the same thing everywhere: nothing to review, so no CTA. It never
 * mutates anything and never guesses a stored value it was not given.
 *
 * These editors live in the **listing editor** now — Availability and Pricing — rather
 * than in the calendar. The shape did not have to change for that: a screen that stages
 * one change and hands it to a review dialog is the same screen wherever it is mounted,
 * which is why the calendar's review model is reused rather than reimplemented.
 *
 * **One decision per confirmation.** A `ListingChange` carries exactly one change, and
 * so does a review plan.
 */

import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import type { ListingChange } from "@/lib/host/v2/calendar-review";

/** The saved always-active offer, if the listing has one. At most one is edited. */
export function ongoingPromotionOf(
  listing: HostCalendarListing,
): HostCalendarListing["promotions"][number] | null {
  return (
    listing.promotions.find(
      (promotion) => !promotion.startDate && !promotion.endDate,
    ) ?? null
  );
}

function positiveInteger(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= max;
}

/* -------------------------------------------------------------------------- */
/* Default availability                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How an untouched future date begins, as a staged change.
 *
 * Deliberately its own function rather than a field on a form: it is one question with
 * one answer, and choosing the value already stored is not a change. Listing visibility
 * is not modelled beside it — a listing can be visible and unbookable, and bookable
 * dates can exist on a listing nobody can find, so the two questions are answered in
 * different places and neither is ever folded into the other's confirmation.
 */
export function availabilityDefaultDraft(
  chosen: "OPEN" | "CLOSED" | null,
  listing: HostCalendarListing,
): ListingChange | null {
  if (!chosen) return null;
  if (chosen === listing.availabilityMode) return null;
  return { kind: "AVAILABILITY_MODE", to: chosen };
}

/* -------------------------------------------------------------------------- */
/* Default price                                                               */
/* -------------------------------------------------------------------------- */

export interface DefaultsForm {
  baseNightlyRate: string;
  cleaningFee: string;
}

export function defaultsFormOf(listing: HostCalendarListing): DefaultsForm {
  return {
    baseNightlyRate: String(listing.pricing?.baseNightlyRate ?? ""),
    cleaningFee: String(listing.pricing?.cleaningFee ?? ""),
  };
}

/**
 * The pricing rule the host has edited, carrying **only the fields they touched**.
 *
 * `saveCalendarDefaultPricing` writes both amounts, so something has to supply the
 * untouched one — and that something is the review model, which fills it from the
 * pricing rule actually loaded from the database. Sending a value from here that the
 * host did not type would mean re-saving whatever this screen happened to be showing,
 * which is not the same thing as what is stored.
 *
 * Two amounts and nothing else. The minimum and maximum stay are booking rules, saved
 * from Availability → Booking rules by their own action; if this form carried them, a
 * Pricing tab opened before that edit would write its stale copy back over it on the
 * next price save.
 */
export function defaultsDraft(
  form: DefaultsForm,
  listing: HostCalendarListing,
): ListingChange | null {
  const pricing = listing.pricing;
  // Without a loaded rule there is nothing to merge the omitted amount with, so there
  // is no honest partial edit to make.
  if (!pricing) return null;

  const stored = defaultsFormOf(listing);
  const to: { baseNightlyRate?: number; cleaningFee?: number } = {};

  if (form.baseNightlyRate.trim() !== stored.baseNightlyRate) {
    const value = Number(form.baseNightlyRate.trim());
    if (form.baseNightlyRate.trim() === "") return null;
    if (!Number.isFinite(value) || value < 1) return null;
    if (value !== pricing.baseNightlyRate) to.baseNightlyRate = value;
  }
  if (form.cleaningFee.trim() !== stored.cleaningFee) {
    const value = Number(form.cleaningFee.trim());
    if (form.cleaningFee.trim() === "") return null;
    if (!Number.isFinite(value) || value < 0) return null;
    if (value !== pricing.cleaningFee) to.cleaningFee = value;
  }

  if (Object.keys(to).length === 0) return null;
  return { kind: "DEFAULT_PRICING", to };
}

/* -------------------------------------------------------------------------- */
/* Ongoing promotions                                                          */
/* -------------------------------------------------------------------------- */

export interface OngoingPromotionForm {
  /** The saved offer being edited. Absent when the host is creating a new one. */
  promotionId?: string;
  discountPercent: string;
  minimumNights: string;
  freeCleaning: boolean;
  roundToWholeUnit: boolean;
  /** True once the host has staged a removal rather than an edit. */
  removing: boolean;
}

/**
 * Seed the offer form from what is actually stored.
 *
 * `roundToWholeUnit` is read straight off the saved offer with no fallback. It is a
 * real stored decision, and defaulting it to `true` when editing would quietly change
 * how every discounted night is priced on a save the host thought only touched the
 * percentage. The default only applies where there is nothing to overwrite.
 */
export function ongoingPromotionFormOf(
  listing: HostCalendarListing,
  /**
   * Which saved offer to edit. `null` seeds a blank form, which is how a second offer
   * gets created — the screen used to find the first always-active offer for itself and
   * so could only ever overwrite that one, making a ladder impossible to build.
   */
  target: HostCalendarListing["promotions"][number] | null = ongoingPromotionOf(
    listing,
  ),
): OngoingPromotionForm {
  const saved = target;
  if (!saved) {
    return {
      discountPercent: "",
      minimumNights: String(listing.pricing?.minNights ?? 1),
      freeCleaning: false,
      roundToWholeUnit: true,
      removing: false,
    };
  }
  return {
    promotionId: saved.id,
    discountPercent: String(saved.discountPercent),
    minimumNights: String(saved.minimumNights ?? listing.pricing?.minNights ?? 1),
    freeCleaning: saved.freeCleaning,
    roundToWholeUnit: saved.roundToWholeUnit,
    removing: false,
  };
}

export function ongoingPromotionDraft(
  form: OngoingPromotionForm,
  listing: HostCalendarListing,
): ListingChange | null {
  // The offer the form is pointed at, not whichever one happens to be first. A form
  // with no `promotionId` is a new offer and must not be matched to an existing one.
  const saved = form.promotionId
    ? (listing.promotions.find(
        (promotion) => promotion.id === form.promotionId,
      ) ?? null)
    : null;

  if (form.removing) {
    // Removal is by the saved offer's own id, never by anything reconstructed from
    // the form — the form describes an edit, and an edit is not what is happening.
    if (!saved) return null;
    return {
      kind: "EVERGREEN_PROMOTION",
      action: "REMOVE",
      promotionId: saved.id,
    };
  }

  const pricing = listing.pricing;
  if (!pricing) return null;

  const discountPercent = Number(form.discountPercent.trim() || "0");
  const minimumNights = Number(form.minimumNights.trim());
  if (!Number.isInteger(discountPercent)) return null;
  if (discountPercent < 0 || discountPercent > 50) return null;
  if (!positiveInteger(minimumNights, pricing.maxNights)) return null;
  // An offer that discounts nothing and waives nothing is not an offer.
  if (discountPercent === 0 && !form.freeCleaning) return null;
  if (form.freeCleaning && pricing.cleaningFee <= 0) return null;

  // Rounding only means anything alongside a percentage discount. Normalized the same
  // way the review model normalizes it, so the two cannot disagree about a no-op.
  const roundToWholeUnit = discountPercent > 0 && form.roundToWholeUnit;

  if (
    saved &&
    saved.discountPercent === discountPercent &&
    saved.freeCleaning === form.freeCleaning &&
    (saved.minimumNights ?? pricing.minNights) === minimumNights &&
    saved.roundToWholeUnit === roundToWholeUnit
  ) {
    return null;
  }

  return {
    kind: "EVERGREEN_PROMOTION",
    action: "UPSERT",
    offer: {
      promotionId: saved?.id,
      discountPercent,
      minimumNights,
      freeCleaning: form.freeCleaning,
      roundToWholeUnit,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Naming the action                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What the shell's single button should say it will review.
 *
 * Derived from the staged change rather than from which editor is open, because the
 * visibility screen holds three different decisions and "Review removal" is a
 * materially different promise from "Review ongoing promotion".
 */
export type ListingCta =
  | "REVIEW_AVAILABILITY_RULE"
  | "REVIEW_DEFAULTS"
  | "REVIEW_ONGOING_PROMOTION"
  | "REVIEW_PROMOTION_REMOVAL";

export function listingCtaFor(change: ListingChange): ListingCta {
  switch (change.kind) {
    case "AVAILABILITY_MODE":
      return "REVIEW_AVAILABILITY_RULE";
    case "DEFAULT_PRICING":
      return "REVIEW_DEFAULTS";
    default:
      return change.action === "REMOVE"
        ? "REVIEW_PROMOTION_REMOVAL"
        : "REVIEW_ONGOING_PROMOTION";
  }
}

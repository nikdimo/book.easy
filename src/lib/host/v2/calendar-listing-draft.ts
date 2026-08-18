/**
 * What the listing-wide editors have typed, and the single change it amounts to.
 *
 * The date editors already work this way: the panel holds one `DateChange | null`, the
 * shell's Review button is enabled exactly when it is non-null, and the review model
 * turns it into steps. The listing-wide editors used to be the exception — each card
 * raised its own review from a button inside itself — so the shell had no idea whether
 * there was anything to save and could not own the primary action.
 *
 * This module closes that gap. It converts form state into `ListingChange | null`, and
 * `null` means the same thing everywhere: nothing to review, so no CTA. It never
 * mutates anything and never guesses a stored value it was not given.
 *
 * **One decision per confirmation.** A `ListingChange` carries exactly one change, and
 * so does a review plan. The visibility screen shows three separate decisions, so the
 * pending one is modelled explicitly as a single value rather than diffed out of a form
 * that could disagree with itself — two edits could otherwise produce one review that
 * silently dropped one of them.
 */

import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import type { ListingChange } from "@/lib/host/v2/calendar-review";
import { isPublishableStatus, canHide } from "@/lib/host/v2/listing-status";

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
/* Listing visibility and default availability                                 */
/* -------------------------------------------------------------------------- */

/**
 * The one decision the host has made on the visibility screen, or null.
 *
 * Three questions live on that screen — whether guests can see the listing, how an
 * untouched date starts out, and the minimum stay — and each is a different promise
 * with a different consequence. Holding only the latest keeps the other two showing
 * their saved values, so the screen can never present two pending edits and review one.
 */
export type VisibilityDecision =
  | { field: "visibility"; to: "LIVE" | "HIDDEN" }
  | { field: "mode"; to: "OPEN" | "CLOSED" }
  /** Raw input text, so a half-typed number is a no-op rather than a save. */
  | { field: "minNights"; value: string };

export function visibilityDraft(
  decision: VisibilityDecision | null,
  listing: HostCalendarListing,
): ListingChange | null {
  if (!decision) return null;

  if (decision.field === "visibility") {
    const live = listing.status === "APPROVED";
    if (decision.to === (live ? "LIVE" : "HIDDEN")) return null;
    // Refused here as well as in the review, so the CTA is never offered for a move
    // the listing cannot make — a disabled button that explains itself beats an
    // enabled one that opens a dialog only to say no.
    if (decision.to === "LIVE" && !isPublishableStatus(listing)) return null;
    if (decision.to === "HIDDEN" && !canHide(listing)) return null;
    return { kind: "VISIBILITY", to: decision.to };
  }

  if (decision.field === "mode") {
    if (decision.to === listing.availabilityMode) return null;
    return { kind: "AVAILABILITY_MODE", to: decision.to };
  }

  const pricing = listing.pricing;
  if (!pricing) return null;
  const value = Number(decision.value.trim());
  if (decision.value.trim() === "") return null;
  if (!positiveInteger(value, pricing.maxNights)) return null;
  if (value === pricing.minNights) return null;
  return { kind: "MIN_NIGHTS", to: value };
}

/* -------------------------------------------------------------------------- */
/* Default price and stay rules                                                */
/* -------------------------------------------------------------------------- */

export interface DefaultsForm {
  baseNightlyRate: string;
  cleaningFee: string;
  minNights: string;
}

export function defaultsFormOf(listing: HostCalendarListing): DefaultsForm {
  return {
    baseNightlyRate: String(listing.pricing?.baseNightlyRate ?? ""),
    cleaningFee: String(listing.pricing?.cleaningFee ?? ""),
    minNights: String(listing.pricing?.minNights ?? 1),
  };
}

/**
 * The pricing rule the host has edited, carrying **only the fields they touched**.
 *
 * `saveCalendarDefaultPricing` writes the whole rule, so something has to supply the
 * untouched fields — and that something is the review model, which fills them from the
 * pricing rule actually loaded from the database. Sending a value from here that the
 * host did not type would mean re-saving whatever this screen happened to be showing,
 * which is not the same thing as what is stored.
 */
export function defaultsDraft(
  form: DefaultsForm,
  listing: HostCalendarListing,
): ListingChange | null {
  const pricing = listing.pricing;
  // Without a loaded rule there is nothing to merge omitted fields with, so there is
  // no honest partial edit to make.
  if (!pricing) return null;

  const stored = defaultsFormOf(listing);
  const to: { baseNightlyRate?: number; cleaningFee?: number; minNights?: number } =
    {};

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
  if (form.minNights.trim() !== stored.minNights) {
    const value = Number(form.minNights.trim());
    if (form.minNights.trim() === "") return null;
    if (!positiveInteger(value, pricing.maxNights)) return null;
    if (value !== pricing.minNights) to.minNights = value;
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
  | "REVIEW_VISIBILITY"
  | "REVIEW_AVAILABILITY_RULE"
  | "REVIEW_MIN_NIGHTS"
  | "REVIEW_DEFAULTS"
  | "REVIEW_ONGOING_PROMOTION"
  | "REVIEW_PROMOTION_REMOVAL";

export function listingCtaFor(change: ListingChange): ListingCta {
  switch (change.kind) {
    case "VISIBILITY":
      return "REVIEW_VISIBILITY";
    case "AVAILABILITY_MODE":
      return "REVIEW_AVAILABILITY_RULE";
    case "MIN_NIGHTS":
      return "REVIEW_MIN_NIGHTS";
    case "DEFAULT_PRICING":
      return "REVIEW_DEFAULTS";
    default:
      return change.action === "REMOVE"
        ? "REVIEW_PROMOTION_REMOVAL"
        : "REVIEW_ONGOING_PROMOTION";
  }
}

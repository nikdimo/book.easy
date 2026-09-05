import { addDaysToYmd } from "@/lib/utils/date-only";
import { contiguousRuns } from "./calendar-date-runs";
import { resolveDay, type ListingCalendarIndex } from "./calendar-model";
import type { MutationStep } from "./calendar-review";
import type { HostCalendarListing } from "./calendar-types";

/**
 * Availability, as a direct act rather than a reviewed plan.
 *
 * Price and promotion edits still go through the review dialog: a wrong nightly rate is
 * not something a host can spot and undo in one gesture. Blocking and opening dates is,
 * so this module exists to make that path immediate — and, crucially, *reversible* —
 * without borrowing the review model's "one staged change, then confirm" shape.
 *
 * Two things it owns that a count alone could not give the panel:
 *
 * 1. **Which dates would really move.** A selection routinely contains nights that no
 *    button here can touch — a reservation, or a block imported from a calendar the host
 *    connected elsewhere. The buttons name the number they *will* change, and the panel
 *    says out loud how many are staying put, so a press can never do quietly less than
 *    it promised.
 * 2. **An exact inverse.** Undo has to put back only the nights this action moved. The
 *    canonical availability actions work on ranges, so the changed dates are grouped
 *    into contiguous runs and each run becomes its own step; reversing the whole
 *    selection instead would reopen blocks the host set weeks ago and never touched.
 */

export type AvailabilityDirection = "OPEN" | "BLOCK";

export interface AvailabilityActionModel {
  /** Every date in the selection. */
  dates: string[];
  /** Blocked dates this host can reopen — manual blocks and closed-by-default days. */
  openable: string[];
  /** Open dates this host can block. */
  blockable: string[];
  /** Selected nights a guest has already booked. */
  booked: number;
  /** Selected nights held by a connected calendar. */
  external: number;
}

/** Nights nothing on this panel can move, whichever button is pressed. */
export function lockedCount(model: AvailabilityActionModel): number {
  return model.booked + model.external;
}

export function datesFor(
  model: AvailabilityActionModel,
  direction: AvailabilityDirection,
): string[] {
  return direction === "OPEN" ? model.openable : model.blockable;
}

export function buildAvailabilityAction({
  listing,
  index,
  dates,
  today,
}: {
  listing: HostCalendarListing;
  index: ListingCalendarIndex;
  dates: string[];
  today: string;
}): AvailabilityActionModel {
  const model: AvailabilityActionModel = {
    dates,
    openable: [],
    blockable: [],
    booked: 0,
    external: 0,
  };
  for (const date of dates) {
    const day = resolveDay(listing, index, date, today);
    if (day.open) {
      model.blockable.push(date);
      continue;
    }
    if (day.state === "booked") {
      model.booked += 1;
      continue;
    }
    if (day.state === "blocked") {
      // `editable` is the whole test. An EXTERNAL_SYNC block belongs to the remote
      // calendar that would only put it back on the next import.
      if (day.editable) model.openable.push(date);
      else model.external += 1;
    }
    // Past dates fall through: the grid refuses to select them in the first place.
  }
  return model;
}

export { contiguousRuns };

/**
 * The same act, aimed at more than one property.
 *
 * A host blocking dates for their own family is doing one thing, not five, and until
 * now the calendar made them do it five times. What makes that safe to collapse is
 * that this is the *only* edit here with no per-property arithmetic to reconcile: a
 * night is blocked or it is not, and the inverse is exact. Prices deliberately stay
 * single-property — see `AllListingsTimeline` for why.
 *
 * Everything below is built from `buildAvailabilityAction` run once per property, so a
 * second property can never be treated more loosely than the one on screen. In
 * particular each property keeps its own count of nights that cannot move, because a
 * reservation on one is not a reservation on another, and the panel names them.
 */

export interface MultiAvailabilityTarget {
  listingId: string;
  /** The host's own words. Rendered `notranslate`. */
  title: string;
  model: AvailabilityActionModel;
  /** The dates this direction would actually move on this property. */
  moving: string[];
}

export interface MultiAvailabilityPlan {
  direction: AvailabilityDirection;
  /** Every property aimed at, in rail order — including ones nothing will move on. */
  targets: MultiAvailabilityTarget[];
  /** Nights that will move, summed across properties. */
  nights: number;
  /** Properties at least one night will move on. */
  properties: number;
  /** Nights a guest or a connected calendar holds, summed across properties. */
  lockedNights: number;
  /** The properties those held nights sit on, in rail order. */
  lockedTitles: string[];
  bookedNights: number;
  externalNights: number;
}

/**
 * What pressing the button would do, across every property aimed at.
 *
 * `entries` is the target set in rail order and always contains the property whose
 * grid the dates were selected on; that one is what a single-property action already
 * was, so a plan of length one is deliberately identical to the old path rather than a
 * special case beside it.
 */
export function buildMultiAvailabilityPlan({
  entries,
  dates,
  today,
  direction,
}: {
  entries: { listing: HostCalendarListing; index: ListingCalendarIndex }[];
  dates: string[];
  today: string;
  direction: AvailabilityDirection;
}): MultiAvailabilityPlan {
  const targets = entries.map((entry) => {
    const model = buildAvailabilityAction({
      listing: entry.listing,
      index: entry.index,
      dates,
      today,
    });
    return {
      listingId: entry.listing.id,
      title: entry.listing.title,
      model,
      moving: datesFor(model, direction),
    };
  });

  const plan: MultiAvailabilityPlan = {
    direction,
    targets,
    nights: 0,
    properties: 0,
    lockedNights: 0,
    lockedTitles: [],
    bookedNights: 0,
    externalNights: 0,
  };
  for (const target of targets) {
    plan.nights += target.moving.length;
    if (target.moving.length > 0) plan.properties += 1;
    const locked = lockedCount(target.model);
    if (locked > 0) {
      plan.lockedNights += locked;
      plan.lockedTitles.push(target.title);
    }
    plan.bookedNights += target.model.booked;
    plan.externalNights += target.model.external;
  }
  return plan;
}

/** One property's half of a multi-property action, and the way back from it. */
export interface ListingMutationBatch {
  listingId: string;
  /** Nights this property is contributing. Used for the per-property result line. */
  nights: number;
  steps: MutationStep[];
  undoSteps: MutationStep[];
}

/**
 * The writes a plan turns into, one entry per property that has something to write.
 *
 * Properties where nothing can move are dropped rather than sent as empty work: an
 * action that reports "3 properties" when one of them was never touched is the quiet
 * over-promise this whole module exists to prevent.
 */
export function batchesForPlan(
  plan: MultiAvailabilityPlan,
  note?: string | null,
): ListingMutationBatch[] {
  return plan.targets
    .filter((target) => target.moving.length > 0)
    .map((target) => ({
      listingId: target.listingId,
      nights: target.moving.length,
      steps: stepsForDates(target.moving, plan.direction, note),
      // Built from this property's own moving dates, so undo can never reopen a block
      // the host set on it weeks ago and never touched.
      undoSteps: undoStepsForDates(target.moving, plan.direction),
    }));
}

/**
 * The mutations that move exactly these dates and nothing else.
 *
 * `endDate` is exclusive — the morning after the last selected night — which is the
 * same `[checkIn, checkOut)` pair every availability service already takes.
 */
export function stepsForDates(
  dates: string[],
  direction: AvailabilityDirection,
  note?: string | null,
): MutationStep[] {
  return contiguousRuns(dates).map((run) =>
    direction === "OPEN"
      ? { type: "OPEN_RANGE", startDate: run.start, endDate: addDaysToYmd(run.end, 1) }
      : {
          type: "BLOCK_RANGE",
          startDate: run.start,
          endDate: addDaysToYmd(run.end, 1),
          note: note?.trim() ? note.trim() : undefined,
        },
  );
}

/**
 * What undoing an action means.
 *
 * The inverse direction over the same dates, and never a note: a note describes why the
 * host blocked something, and undoing a block leaves nothing for it to describe.
 */
export function undoStepsForDates(
  dates: string[],
  direction: AvailabilityDirection,
): MutationStep[] {
  return stepsForDates(dates, direction === "OPEN" ? "BLOCK" : "OPEN");
}

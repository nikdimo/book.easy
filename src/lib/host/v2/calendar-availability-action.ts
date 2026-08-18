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

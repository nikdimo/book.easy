/**
 * Everything the host has already scheduled, as a short readable list.
 *
 * The calendar shows *state* — what each date is. This shows *decisions* — the blocks,
 * open windows, custom prices, dated offers and reservations that produced that state,
 * each as one row covering the whole run it applies to. That distinction is the reason
 * contiguous dates are grouped rather than listed: a host who priced sixty nights at
 * €140 made one decision, and sixty rows saying so would bury the two that matter.
 *
 * Grouping is only ever done where it is truthful. Blocks, windows and promotions are
 * stored as ranges already, so they are reported as the ranges they are. Custom prices
 * are stored per date, so a run is emitted only while the rate is unchanged and the
 * dates are genuinely consecutive — a gap or a different rate ends it.
 *
 * Nothing here mutates anything, and nothing here decides what the host may do; it
 * reports what exists, and which of it this panel owns.
 */

import { addDaysToYmd, compareYmd } from "@/lib/utils/date-only";
import type {
  HostCalendarListing,
  HostCalendarPromotion,
} from "@/lib/host/v2/calendar-types";
import type { CalendarSelection } from "@/lib/host/v2/calendar-selection";
import type { WorkbenchEditor } from "@/lib/host/v2/calendar-workbench";

export type ScheduledCategory =
  | "availability"
  | "pricing"
  | "promotions"
  | "reservations";

export type ScheduledFilter = "all" | ScheduledCategory;

export const SCHEDULED_FILTERS: readonly ScheduledFilter[] = [
  "all",
  "availability",
  "pricing",
  "promotions",
  "reservations",
];

export type ScheduledChangeKind =
  | "MANUAL_BLOCK"
  | "OPEN_WINDOW"
  | "DATE_PRICE"
  | "DATED_PROMOTION"
  | "RESERVATION"
  | "EXTERNAL_BLOCK";

/** Why an entry is read-only. Both are owned by something outside this panel. */
export type ScheduledProtection = "RESERVATION" | "EXTERNAL";

export interface ScheduledChange {
  id: string;
  kind: ScheduledChangeKind;
  category: ScheduledCategory;
  /** Inclusive first date, clamped to today. */
  from: string;
  /** Inclusive last date, clamped to the loaded horizon. */
  to: string;
  nights: number;
  /** The host's private note. Manual blocks only — nothing else has one. */
  note: string | null;
  /** Custom nightly rate. `DATE_PRICE` only. */
  nightlyRate: number | null;
  /** The stored offer. `DATED_PROMOTION` only. */
  promotion: HostCalendarPromotion | null;
  guestName: string | null;
  /** True when this panel can change it. */
  editable: boolean;
  /** Set when it cannot, so the row can say why rather than just refusing. */
  protection: ScheduledProtection | null;
  /**
   * The dates to select and the editor to open when the row is activated.
   *
   * Present on protected rows too: selecting a reservation's dates so the host can
   * *look* at them is useful, and the editor it opens is the one that will explain
   * that the dates are not this panel's to change.
   */
  target: { selection: CalendarSelection; editor: WorkbenchEditor };
}

/** Order within a day, so two decisions starting on the same date read consistently. */
const CATEGORY_ORDER: Record<ScheduledCategory, number> = {
  reservations: 0,
  availability: 1,
  pricing: 2,
  promotions: 3,
};

/**
 * Clip a stored `[start, endExclusive)` range to the window the panel loaded.
 *
 * Returns null when nothing of it survives — a block that ended yesterday is not a
 * scheduled change, it is history, and the calendar does not load it either.
 */
function clip(
  startDate: string,
  endExclusive: string,
  today: string,
  horizonEnd: string,
): { from: string; to: string; nights: number } | null {
  const from = compareYmd(startDate, today) < 0 ? today : startDate;
  const endBound =
    compareYmd(endExclusive, horizonEnd) > 0 ? horizonEnd : endExclusive;
  if (compareYmd(endBound, from) <= 0) return null;
  const to = addDaysToYmd(endBound, -1);
  let nights = 0;
  for (
    let cursor = from;
    compareYmd(cursor, endBound) < 0;
    cursor = addDaysToYmd(cursor, 1)
  ) {
    nights += 1;
  }
  return { from, to, nights };
}

function trimmed(value: string | null): string | null {
  const text = value?.trim();
  return text ? text : null;
}

/** Whether an offer is pinned to dates rather than running on all of them. */
export function isDatedPromotion(promotion: HostCalendarPromotion): boolean {
  return Boolean(promotion.startDate || promotion.endDate);
}

/**
 * Contiguous runs of dates sharing one custom rate.
 *
 * `datePrices` arrives ordered by date, but a missing date means the run has ended —
 * the dates in between follow the base price, and reporting them inside the run would
 * claim a custom price the listing does not have.
 */
function priceRuns(
  listing: HostCalendarListing,
  today: string,
  horizonEnd: string,
): Array<{ from: string; to: string; nightlyRate: number }> {
  const rows = [...listing.datePrices]
    .filter(
      (row) =>
        compareYmd(row.date, today) >= 0 && compareYmd(row.date, horizonEnd) < 0,
    )
    .sort((left, right) => compareYmd(left.date, right.date));

  const runs: Array<{ from: string; to: string; nightlyRate: number }> = [];
  for (const row of rows) {
    const open = runs.at(-1);
    if (
      open &&
      open.nightlyRate === row.nightlyRate &&
      addDaysToYmd(open.to, 1) === row.date
    ) {
      open.to = row.date;
      continue;
    }
    runs.push({ from: row.date, to: row.date, nightlyRate: row.nightlyRate });
  }
  return runs;
}

function nightsBetween(from: string, to: string): number {
  let nights = 0;
  for (
    let cursor = from;
    compareYmd(cursor, to) <= 0;
    cursor = addDaysToYmd(cursor, 1)
  ) {
    nights += 1;
  }
  return nights;
}

export function buildScheduledChanges({
  listing,
  today,
  horizonEnd,
}: {
  listing: HostCalendarListing;
  today: string;
  /** Exclusive end of the loaded window. */
  horizonEnd: string;
}): ScheduledChange[] {
  const entries: ScheduledChange[] = [];

  for (const block of listing.blocks) {
    const span = clip(block.startDate, block.endDate, today, horizonEnd);
    if (!span) continue;
    const selection = { start: span.from, end: span.to };

    if (block.blockType === "BOOKING_HOLD") {
      entries.push({
        id: block.id,
        kind: "RESERVATION",
        category: "reservations",
        ...span,
        note: null,
        nightlyRate: null,
        promotion: null,
        guestName: block.guestName,
        editable: false,
        protection: "RESERVATION",
        target: { selection, editor: "availability" },
      });
      continue;
    }

    if (block.blockType === "EXTERNAL_SYNC") {
      entries.push({
        id: block.id,
        kind: "EXTERNAL_BLOCK",
        category: "availability",
        ...span,
        note: null,
        nightlyRate: null,
        promotion: null,
        guestName: null,
        editable: false,
        protection: "EXTERNAL",
        target: { selection, editor: "availability" },
      });
      continue;
    }

    entries.push({
      id: block.id,
      kind: "MANUAL_BLOCK",
      category: "availability",
      ...span,
      // The host's own note, shown here because this is the only screen that lists
      // their blocks as decisions rather than as shaded squares.
      note: trimmed(block.reason),
      nightlyRate: null,
      promotion: null,
      guestName: null,
      editable: true,
      protection: null,
      target: { selection, editor: "availability" },
    });
  }

  // An explicit open window only means anything while the listing is closed by
  // default. In OPEN mode every date is already open and a window decides nothing, so
  // listing one would be reporting a decision that has no effect.
  if (listing.availabilityMode === "CLOSED") {
    for (const window of listing.availabilityWindows) {
      const span = clip(window.startDate, window.endDate, today, horizonEnd);
      if (!span) continue;
      entries.push({
        id: window.id,
        kind: "OPEN_WINDOW",
        category: "availability",
        ...span,
        note: null,
        nightlyRate: null,
        promotion: null,
        guestName: null,
        editable: true,
        protection: null,
        target: {
          selection: { start: span.from, end: span.to },
          editor: "availability",
        },
      });
    }
  }

  for (const run of priceRuns(listing, today, horizonEnd)) {
    entries.push({
      id: `price:${run.from}:${run.to}`,
      kind: "DATE_PRICE",
      category: "pricing",
      from: run.from,
      to: run.to,
      nights: nightsBetween(run.from, run.to),
      note: null,
      nightlyRate: run.nightlyRate,
      promotion: null,
      guestName: null,
      editable: true,
      protection: null,
      target: {
        selection: { start: run.from, end: run.to },
        editor: "pricing",
      },
    });
  }

  for (const promotion of listing.promotions) {
    if (!isDatedPromotion(promotion)) continue;
    const span = clip(
      promotion.startDate ?? today,
      promotion.endDate ?? horizonEnd,
      today,
      horizonEnd,
    );
    if (!span) continue;
    // Selecting the offer's own stored range is what lets the promotion editor
    // recognise it as this range's own offer and update it in place rather than
    // stacking a second one on top. A run that started before today can only be
    // reached from today onwards, and the editor says so on its own.
    const selection =
      promotion.startDate && promotion.endDate
        ? {
            start:
              compareYmd(promotion.startDate, today) < 0
                ? span.from
                : promotion.startDate,
            end:
              compareYmd(promotion.startDate, today) < 0
                ? span.to
                : addDaysToYmd(promotion.endDate, -1),
          }
        : { start: span.from, end: span.to };
    entries.push({
      id: promotion.id,
      kind: "DATED_PROMOTION",
      category: "promotions",
      ...span,
      note: null,
      nightlyRate: null,
      promotion,
      guestName: null,
      editable: true,
      protection: null,
      target: { selection, editor: "promotions" },
    });
  }

  return entries.sort((left, right) => {
    const byDate = compareYmd(left.from, right.from);
    if (byDate !== 0) return byDate;
    const byCategory =
      CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category];
    if (byCategory !== 0) return byCategory;
    return left.id.localeCompare(right.id);
  });
}

export function filterScheduledChanges(
  entries: ScheduledChange[],
  filter: ScheduledFilter,
): ScheduledChange[] {
  return filter === "all"
    ? entries
    : entries.filter((entry) => entry.category === filter);
}

/** How many entries each filter would show, so a filter can name its own count. */
export function scheduledChangeCounts(
  entries: ScheduledChange[],
): Record<ScheduledFilter, number> {
  const counts: Record<ScheduledFilter, number> = {
    all: entries.length,
    availability: 0,
    pricing: 0,
    promotions: 0,
    reservations: 0,
  };
  for (const entry of entries) counts[entry.category] += 1;
  return counts;
}

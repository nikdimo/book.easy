"use client";

import { memo, useMemo } from "react";
import { BASE_CURRENCY } from "@/lib/currency/currency-preference";
import { addDays, format, startOfWeek } from "date-fns";
import { Lock } from "lucide-react";
import {
  formatLongDate,
  type CalendarFormats,
} from "@/lib/host/v2/calendar-format";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import {
  resolveDay,
  type CalendarStayEdge,
  type HostCalendarDay,
  type ListingCalendarIndex,
} from "@/lib/host/v2/calendar-model";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import {
  isSelected,
  type CalendarSelection,
} from "@/lib/host/v2/calendar-selection";
import { compareYmd, ymdToLocalDate } from "@/lib/utils/date-only";
import { ChannelChip, DirectBookingChip } from "./channel-chip";
import { dayStateBadge, dayStateLabel, money } from "./calendar-labels";

/**
 * A hairline edge — the shape every host has already learned from every other booking
 * calendar. The radius is set per cell, in `cellRadius`, because an occupied date's
 * corners depend on where it falls inside its stay.
 *
 * It replaces a cut corner drawn with `clip-path`, which needed its own background layer
 * (a clip on the button would have taken the focus ring with it) and, once the edge was
 * removed, left blocked and open dates separated by two shades of nearly the same grey.
 * A border and a radius on the button itself do the job with no extra layer.
 */
const CELL_SHAPE = "border";

/**
 * A date somebody is already on, in one colour.
 *
 * It used to be two: navy for a booking taken here, slate for a date a connected
 * calendar was holding. The distinction is real, but it is not the question this grid
 * answers. A host scanning a month is asking "what is free and what is not", and making
 * the eye sort two dark greys before it can answer that was work for a fact that lives
 * one panel away in Reservations.
 *
 * So the fill says occupied and nothing else, and the channel mark on the two ends of
 * the stay carries where it came from — visible when it is wanted, silent when it is
 * not.
 */
const OCCUPIED_FILL = "#cfe4f8";
const OCCUPIED_EDGE = "#7fb2e4";

/**
 * Fill and edge per state.
 *
 * Open is white and blocked is grey, which is the contrast every guest-facing calendar
 * uses and the one a host reads without consulting a key. It works here because the cell
 * has an edge again: white-on-white needs no shape of its own when a hairline is drawing
 * one.
 *
 * Selection warms each fill rather than replacing it. It used to replace it, which meant
 * a run covering both open and blocked nights came out a single flat colour — exactly
 * the case the two-button editor beside the grid is there to handle.
 */
function cellStyle(
  day: HostCalendarDay,
  selected: boolean,
): { background: string; borderColor: string; boxShadow?: string } {
  const borderColor =
    day.state === "booked" || day.reason === "external"
      ? OCCUPIED_EDGE
      : day.state === "open_not_bookable"
        ? "#e2bd6a"
        : day.state === "past"
          ? "#eaeef1"
          : day.state === "blocked"
            ? day.reason === "closed_default"
              ? "#dfe5ec"
              : "#c6d0da"
            : "#d5dbe1";

  // The one mark that survives every fill underneath it. Selection cannot be a colour
  // here: blue is booked, amber is open-but-not-bookable and the greys are blocked, so
  // any hue strong enough to see would be claiming one of those meanings. A dark ring
  // is not in the state vocabulary at all, and it is the only treatment that shows on
  // a booked night — where the fill has to stay blue, and so has nothing left to say.
  const ring = selected ? { boxShadow: "inset 0 0 0 2px #0f172a" } : {};

  if (day.state === "booked" || day.reason === "external") {
    return { background: OCCUPIED_FILL, borderColor, ...ring };
  }
  // Warmed rather than replaced. A blocked night in the middle of a selected run has to
  // go on looking blocked — it is the case the two-button editor beside the grid is for
  // — so the tint is laid over the grey instead of erasing it, and the struck-through
  // date carries on saying what the night is.
  if (day.state === "blocked") {
    /**
     * A date nobody has touched, on a listing that starts closed. Paler than a block,
     * because it is not one: no host action put it here, and a calendar of five hundred
     * identical grey cells reads as five hundred decisions rather than as a listing
     * that has not been opened yet.
     */
    if (day.reason === "closed_default") {
      return { background: selected ? "#e6ecf2" : "#f2f5f8", borderColor, ...ring };
    }
    return { background: selected ? "#d3dae1" : "#e2e7ec", borderColor, ...ring };
  }
  if (day.state === "open_not_bookable") {
    return { background: selected ? "#f7dfa8" : "#fcecc9", borderColor, ...ring };
  }
  if (day.state === "past") return { background: "#fbfcfc", borderColor };
  return { background: selected ? "#dbe3ec" : "#ffffff", borderColor, ...ring };
}

/**
 * The corners, which are the only trace of a stay left once the bar is gone.
 *
 * A stay used to be drawn as one pill laid across its nights. Removing it made the grid
 * quieter but also flattened a week of separate one-night bookings into something that
 * looked identical to a single week-long one. Rounding only the outer two corners puts
 * that back: the eye reads the run without a line drawn through it, and the host can
 * still count nights.
 */
const RADIUS_OUTER = "0.75rem";
const RADIUS_JOINED = "0.1875rem";

function cellRadius(stay: CalendarStayEdge | undefined): string {
  if (!stay) return RADIUS_OUTER;
  const left = stay.arrival ? RADIUS_OUTER : RADIUS_JOINED;
  const right = stay.departure ? RADIUS_OUTER : RADIUS_JOINED;
  // top-left, top-right, bottom-right, bottom-left
  return `${left} ${right} ${right} ${left}`;
}

/** How many days each arrow moves the focus. A row is a week, hence seven. */
const ARROW_STEPS: Record<string, number | undefined> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: 7,
  ArrowUp: -7,
};

export interface CalendarMonthGridProps {
  listing: HostCalendarListing;
  index: ListingCalendarIndex;
  formats: CalendarFormats;
  today: string;
  /** Exclusive end of the loaded window; later dates are not offered. */
  horizonEnd: string;
  /** First day of the rendered month, `YYYY-MM-01`. */
  month: string;
  /**
   * The live selection, or null when it does not reach this month. The stream narrows
   * it per month so an untouched month keeps referential equality and skips rendering.
   */
  selection: CalendarSelection | null;
  /** The roving-tabindex date, or null when the focused date is in another month. */
  focusedDate: string | null;
  onFocusDate: (date: string) => void;
  onSelectDate: (date: string, extend: boolean, toggle: boolean) => void;
  onClearSelection: () => void;
  /**
   * Moving focus can cross a month boundary, so the stream owns it. `extend` is a
   * Shift-arrow: the focus moves and the run grows from its anchor in one keystroke.
   */
  onMoveFocus: (from: string, days: number, extend: boolean) => void;
}

function CalendarMonthGridImpl({
  listing,
  index,
  formats,
  today,
  horizonEnd,
  month,
  selection,
  focusedDate,
  onFocusDate,
  onSelectDate,
  onClearSelection,
  onMoveFocus,
}: CalendarMonthGridProps) {
  const i18n = useI18n();
  const currency = listing.pricing?.currency ?? BASE_CURRENCY;

  const cells = useMemo(() => {
    const first = ymdToLocalDate(month);
    const gridStart = startOfWeek(first, { weekStartsOn: 1 });
    const monthIndex = first.getMonth();
    const days: { date: string; inMonth: boolean }[] = [];
    for (let offset = 0; offset < 42; offset += 1) {
      const day = addDays(gridStart, offset);
      days.push({
        date: format(day, "yyyy-MM-dd"),
        inMonth: day.getMonth() === monthIndex,
      });
    }
    // Trailing weeks that belong entirely to the next month are dropped rather than
    // rendered as six rows of grey on every short month.
    while (days.length > 0 && !days.slice(-7).some((day) => day.inMonth)) {
      days.splice(-7, 7);
    }
    return days;
  }, [month]);

  /**
   * The weeks, and the runs drawn across them.
   *
   * A run is consecutive days that belong to the same thing — one guest's stay, one
   * imported hold, one note — so its name is written once across the whole stretch
   * rather than repeated in every cell. Runs are cut at the week boundary because that
   * is where the grid wraps; a stay crossing Sunday is drawn as two bars, which is what
   * every calendar does and what the eye already expects.
   */
  const weeks = useMemo(() => {
    const resolved = cells.map((cell) => ({
      ...cell,
      day: cell.inMonth ? resolveDay(listing, index, cell.date, today) : null,
    }));
    const rows: Array<{
      days: typeof resolved;
      runs: Array<{ from: number; span: number; run: DayRun }>;
    }> = [];
    for (let start = 0; start < resolved.length; start += 7) {
      const days = resolved.slice(start, start + 7);
      const runs: Array<{ from: number; span: number; run: DayRun }> = [];
      days.forEach((entry, column) => {
        const run = entry.day ? runOf(entry.day, index, entry.date) : null;
        const previous = runs[runs.length - 1];
        if (run && previous && previous.run.key === run.key) {
          previous.span += 1;
          return;
        }
        if (run) runs.push({ from: column, span: 1, run });
      });
      rows.push({ days, runs });
    }
    return rows;
  }, [cells, listing, index, today]);

  return (
    <div className="flex flex-col gap-1">
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} className="relative">
          <div className="grid grid-cols-7 gap-1">
      {week.days.map((cell, position) => {
        if (!cell.inMonth) {
          return (
            <div key={`empty-${position}`} aria-hidden className="min-h-14" />
          );
        }
        const date = cell.date;
        const day = resolveDay(listing, index, date, today);
        const beyondHorizon = compareYmd(date, horizonEnd) >= 0;
        const selected = isSelected(selection, date);
        const disabled = day.state === "past" || beyondHorizon;
        /**
         * A run's label takes the badge's place rather than sitting beside it. A note
         * written across a block and the word "Blocked" under it are the same fact
         * twice, and the cell is fifty-six pixels tall — there is room for one line,
         * not two.
         */
        const run = runOf(day, index, date);
        const badge = run ? null : dayStateBadge(i18n, day);
        const stateLabel = dayStateLabel(i18n, day);
        const priceText =
          day.price !== null ? money(day.price, currency, formats) : null;
        const promotionCount = index.promotionCountByDate.get(date) ?? 0;
        const { background, borderColor, boxShadow } = cellStyle(day, selected);
        const occupied = day.state === "booked" || day.reason === "external";
        /**
         * Drawn on the first and last night only. Repeating it down a two-week stay
         * would say the same thing fourteen times; on the ends it reads as check-in and
         * checkout, which is the part of a stay a host actually plans around.
         */
        const stay = occupied ? index.stayByDate.get(date) : undefined;
        const showMark = Boolean(stay && (stay.arrival || stay.departure));
        // Struck through for blocked and past dates: the same signal every booking
        // calendar uses, and the one that separates a blocked date from an open one
        // without the host reading the badge under it.
        //
        // Occupied dates are left alone. An imported hold is stored as a block, so the
        // strike used to land on channel stays and not on bookings taken here — the
        // distinction the fill just stopped drawing, showing through somewhere else. The
        // blue already says the night is gone; a line through the number as well says it
        // twice, and only on half of them.
        const unbookable =
          !occupied && (day.state === "blocked" || day.state === "past");

        return (
          <button
            key={date}
            type="button"
            data-date={date}
            data-state={day.state}
            data-reason={day.reason ?? undefined}
            data-selected={selected ? "true" : undefined}
            disabled={disabled}
            aria-pressed={disabled ? undefined : selected}
            aria-label={[
              formatLongDate(date, formats),
              stateLabel.text,
              priceText,
              promotionCount > 0
                ? promotionCount === 1
                  ? "1 promotion"
                  : `${promotionCount} promotions`
                : null,
              day.guestName,
            ]
              .filter(Boolean)
              .join(", ")}
            tabIndex={date === focusedDate ? 0 : -1}
            onFocus={() => onFocusDate(date)}
            onClick={(event) =>
              onSelectDate(date, event.shiftKey, event.ctrlKey || event.metaKey)
            }
            onKeyDown={(event) => {
              // Shift turns each arrow into an extension of the existing run rather
              // than a bare move, in all four directions and across month boundaries
              // — the up and down keys step a whole week, so they cross one often.
              const step = ARROW_STEPS[event.key];
              if (step !== undefined) {
                event.preventDefault();
                onMoveFocus(date, step, event.shiftKey);
              } else if (event.key === "Escape") {
                onClearSelection();
              }
            }}
            className={cn(
              CELL_SHAPE,
              "relative flex min-h-14 scroll-mt-[4.25rem] flex-col items-start justify-between p-1.5 text-left transition-transform md:min-h-[4.75rem] md:scroll-mt-2 md:p-2",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f172a]",
              disabled ? "cursor-default" : "hover:-translate-y-px",
            )}
            // Selection is a ring drawn inside the cell, over whatever fill the state
            // already put there. Drawn inside rather than outside so a run of selected
            // nights does not grow by two pixels and shove its neighbours around.
            style={{ background, borderColor, boxShadow, borderRadius: cellRadius(stay) }}
          >

            <span className="relative flex w-full items-start justify-between gap-1">
              <span
                className={cn(
                  "text-[0.8125rem] font-semibold tabular-nums md:text-sm",
                  unbookable && "line-through decoration-1",
                  occupied
                    ? "text-[#042c53]"
                    : day.state === "past"
                      ? "text-slate-300"
                      : day.state === "blocked"
                        ? day.reason === "closed_default"
                          ? "text-slate-400"
                          : "text-slate-500"
                        : "text-slate-900",
                )}
              >
                {ymdToLocalDate(date).getDate()}
              </span>
              <span className="flex shrink-0 items-center gap-1">
              {promotionCount > 0 && day.state !== "past" ? (
                <span
                  aria-hidden
                  className={cn(
                    "rounded-full px-1 py-0.5 text-[0.5625rem] font-semibold leading-none tabular-nums",
                    "bg-[#f1f5f9] text-[#0f172a]",
                  )}
                >
                  {promotionCount === 1 ? "%" : `% ${promotionCount}`}
                </span>
              ) : null}
              {day.state === "available" && !disabled ? (
                <span
                  aria-hidden
                  className="mt-1 size-1.5 shrink-0 rounded-full bg-teal-500"
                />
              ) : day.state === "open_not_bookable" ? (
                <span
                  aria-hidden
                  className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-500"
                />
              ) : day.reason === "manual" ? (
                /* The padlock means someone did this, not merely that the date is
                   unavailable. It used to sit on every unavailable date, which put five
                   hundred of them on a closed-by-default listing for actions nobody
                   took. An imported block has its own texture; a default-closed date
                   has no author to point at. */
                <Lock className="mt-0.5 size-3 shrink-0 text-slate-400" aria-hidden />
              ) : null}
              {showMark ? (
                stay?.platform ? (
                  <ChannelChip platform={stay.platform} />
                ) : stay?.direct ? (
                  <DirectBookingChip />
                ) : null
              ) : null}
              </span>
            </span>

            <span className="relative flex w-full flex-col items-start gap-px">
              {badge ? (
                <span
                  className={cn(
                    "flex max-w-full items-center gap-1 text-[0.625rem] font-medium leading-4",
                    occupied
                      ? "text-[#0c447c]"
                      : day.state === "open_not_bookable"
                        ? "text-amber-700"
                        : "text-slate-500",
                  )}
                >
                  <span className="truncate">{badge.text}</span>
                </span>
              ) : null}
              {priceText && day.state !== "past" ? (
                <span
                  className={cn(
                    "max-w-full truncate text-[0.6875rem] tabular-nums md:text-xs",
                    occupied
                      ? "text-[#185fa5]"
                      : day.state === "blocked"
                        ? "text-slate-300"
                        : day.customPrice
                          ? "font-medium text-[#0f172a]"
                          : "text-slate-500",
                  )}
                >
                  {priceText}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
          </div>

          {/* A second grid laid over the first, so a bar spanning three days lines up
              with those three columns exactly rather than by arithmetic. It never takes
              a pointer: the cells underneath are the drag target. */}
          {week.runs.length > 0 ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 grid grid-cols-7 gap-1"
            >
              {week.runs.map(({ from, span, run }) => (
                <span
                  key={run.key}
                  style={{ gridColumn: `${from + 1} / span ${span}` }}
                  className="flex h-4 items-center gap-1 self-center truncate rounded-full bg-slate-200 px-1.5 text-[0.625rem] font-medium text-slate-600 md:h-[1.125rem]"
                >
                  <span className="truncate">{run.label}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** One stretch of days the calendar can name, and how to draw its label. */
interface DayRun {
  /** Identity, so consecutive days of the same thing merge and different ones do not. */
  key: string;
  label: string;
}

/**
 * What, if anything, to write across this day.
 *
 * One thing earns a bar now: the host's own note on a manual block, and only when they
 * wrote one — a padlock already says who closed the date, and a bar saying nothing is a
 * bar in the way.
 *
 * Occupied dates used to take one too, carrying the guest's name or the feed's. They
 * label themselves in-cell instead. A name is the wrong thing to put in front of
 * someone scanning a month for free nights, and it is a click away in Reservations for
 * the moment they do want it.
 */
function runOf(
  day: HostCalendarDay,
  index: ListingCalendarIndex,
  date: string,
): DayRun | null {
  if (day.reason === "manual") {
    const note = index.manualNoteByDate.get(date);
    if (!note) return null;
    return {
      key: `note:${note}`,
      label: note,
    };
  }
  return null;
}

/**
 * Memoized per month. The stream mounts every month of the horizon at once, so a click
 * that only changes one month's selection must not re-render the other seventeen.
 */
export const CalendarMonthGrid = memo(CalendarMonthGridImpl);

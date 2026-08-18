"use client";

import { memo, useMemo } from "react";
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
  type HostCalendarDay,
  type ListingCalendarIndex,
} from "@/lib/host/v2/calendar-model";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import {
  isSelected,
  type CalendarSelection,
} from "@/lib/host/v2/calendar-selection";
import { compareYmd, ymdToLocalDate } from "@/lib/utils/date-only";
import { dayStateBadge, dayStateLabel, money } from "./calendar-labels";

/**
 * Rounded on all four corners, with a hairline edge — the shape every host has already
 * learned from every other booking calendar.
 *
 * It replaces a cut corner drawn with `clip-path`, which needed its own background layer
 * (a clip on the button would have taken the focus ring with it) and, once the edge was
 * removed, left blocked and open dates separated by two shades of nearly the same grey.
 * A border and a radius on the button itself do the job with no extra layer.
 */
const CELL_SHAPE = "rounded-xl border";

/**
 * Reserved for one state and one state only: a date held by a calendar the host
 * connected elsewhere. It is the single case where the block did not come from this
 * panel and cannot be undone from it, so it is the single case that earns a texture.
 * `reason: "external"` is set from a stored `EXTERNAL_SYNC` block — it is never guessed
 * from a date merely being unavailable.
 */
const EXTERNAL_HATCH =
  "repeating-linear-gradient(135deg, rgb(71 85 105 / 0.16) 0 1.5px, transparent 1.5px 6px)";

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
): { background: string; borderColor: string } {
  const borderColor =
    day.state === "booked"
      ? "#16304a"
      : day.state === "open_not_bookable"
        ? "#f0e0b6"
        : day.state === "past"
          ? "#f2f4f6"
          : day.state === "blocked"
            ? day.reason === "closed_default"
              ? "#eef1f4"
              : "#e6e9ec"
            : "#e2e6ea";

  if (day.state === "booked") return { background: "#16304a", borderColor };
  // Warmed rather than replaced. A blocked night in the middle of a selected run has to
  // go on looking blocked — it is the case the two-button editor beside the grid is for
  // — so the peach is laid over the grey instead of erasing it, and the struck-through
  // date carries on saying what the night is.
  if (day.state === "blocked") {
    /**
     * A date nobody has touched, on a listing that starts closed. Paler than a block,
     * because it is not one: no host action put it here, and a calendar of five hundred
     * identical grey cells reads as five hundred decisions rather than as a listing
     * that has not been opened yet.
     */
    if (day.reason === "closed_default") {
      return { background: selected ? "#f4ece7" : "#fafbfc", borderColor };
    }
    return { background: selected ? "#efe0d6" : "#f2f4f6", borderColor };
  }
  if (day.state === "open_not_bookable") {
    return { background: selected ? "#fbe8c4" : "#fdf8ec", borderColor };
  }
  if (day.state === "past") return { background: "#fbfcfc", borderColor };
  return { background: selected ? "#ffe2cd" : "#ffffff", borderColor };
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
  onSelectDate: (date: string, extend: boolean) => void;
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
  const currency = listing.pricing?.currency ?? "EUR";

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

  return (
    <div className="grid grid-cols-7 gap-1">
      {cells.map((cell, position) => {
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
        const badge = dayStateBadge(i18n, day);
        const stateLabel = dayStateLabel(i18n, day);
        const priceText =
          day.price !== null ? money(day.price, currency, formats) : null;
        const { background, borderColor } = cellStyle(day, selected);
        const onDark = day.state === "booked";
        // Struck through for exactly the states a guest could not book into: the same
        // signal every booking calendar uses, and the one that separates a blocked date
        // from an open one without the host reading the badge under it.
        const unbookable = day.state === "blocked" || day.state === "past";

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
              day.guestName,
            ]
              .filter(Boolean)
              .join(", ")}
            tabIndex={date === focusedDate ? 0 : -1}
            onFocus={() => onFocusDate(date)}
            onClick={(event) => onSelectDate(date, event.shiftKey)}
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
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a94b28]",
              disabled ? "cursor-default" : "hover:-translate-y-px",
            )}
            // Selection is a fill and nothing else. It was briefly a coral edge as well,
            // which put a second, louder line around a handful of cells on a grid whose
            // whole edge treatment is one quiet hairline.
            style={{ background, borderColor }}
          >
            {day.reason === "external" ? (
              <span
                aria-hidden
                className="absolute inset-0 rounded-[inherit]"
                style={{ backgroundImage: EXTERNAL_HATCH }}
              />
            ) : null}

            <span className="relative flex w-full items-start justify-between gap-1">
              <span
                className={cn(
                  "text-[0.8125rem] font-semibold tabular-nums md:text-sm",
                  unbookable && "line-through decoration-1",
                  onDark
                    ? "text-white"
                    : day.state === "past"
                      ? "text-slate-300"
                      : day.state === "blocked"
                        ? day.reason === "closed_default"
                          ? "text-slate-300"
                          : "text-slate-400"
                        : "text-slate-900",
                )}
              >
                {ymdToLocalDate(date).getDate()}
              </span>
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
            </span>

            <span className="relative flex w-full flex-col items-start gap-px">
              {badge ? (
                <span
                  className={cn(
                    "max-w-full truncate text-[0.625rem] font-medium leading-4",
                    onDark
                      ? "text-white/75"
                      : day.state === "open_not_bookable"
                        ? "text-amber-700"
                        : "text-slate-500",
                  )}
                >
                  {badge.text}
                </span>
              ) : null}
              {priceText && day.state !== "past" ? (
                <span
                  className={cn(
                    "truncate text-[0.6875rem] tabular-nums md:text-xs",
                    onDark
                      ? "text-white/70"
                      : day.state === "blocked"
                        ? "text-slate-300"
                        : day.customPrice
                          ? "font-medium text-[#a94b28]"
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
  );
}

/**
 * Memoized per month. The stream mounts every month of the horizon at once, so a click
 * that only changes one month's selection must not re-render the other seventeen.
 */
export const CalendarMonthGrid = memo(CalendarMonthGridImpl);

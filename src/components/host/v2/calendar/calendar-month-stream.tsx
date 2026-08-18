"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import {
  formatMonthYear,
  weekdayLabels,
  type CalendarFormats,
} from "@/lib/host/v2/calendar-format";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { CALENDAR_ANCHOR, anchorProps } from "@/lib/host/v2/calendar-anchors";
import type { ListingCalendarIndex } from "@/lib/host/v2/calendar-model";
import type { HostCalendarListing } from "@/lib/host/v2/calendar-types";
import type { CalendarSelection } from "@/lib/host/v2/calendar-selection";
import { monthIntersectsRange, monthOf } from "@/lib/host/v2/calendar-months";
import {
  containerStreamAtEnd,
  containerScrollTop,
  documentStreamAtEnd,
  documentScrollTop,
  monthReadThreshold,
  monthStreamScrollMode,
  pickVisibleMonth,
} from "@/lib/host/v2/calendar-scroll";
import { addDaysToYmd, compareYmd } from "@/lib/utils/date-only";
import { CalendarMonthGrid } from "./calendar-month-grid";
import { useDragSelect } from "./use-drag-select";

export interface CalendarMonthStreamProps {
  listing: HostCalendarListing;
  index: ListingCalendarIndex;
  formats: CalendarFormats;
  today: string;
  /** Exclusive end of the loaded window. */
  horizonEnd: string;
  /** Every month of the horizon, in order. All of them are mounted. */
  months: string[];
  selection: CalendarSelection | null;
  focusedDate: string;
  onFocusDate: (date: string) => void;
  onSelectDate: (date: string, extend: boolean) => void;
  /** Shift-arrow: grow the run from its anchor, starting at `from` if there is none. */
  onExtendSelection: (from: string, to: string) => void;
  /** A completed pointer drag, committed once on release. */
  onSelectRange: (selection: CalendarSelection, anchor: string) => void;
  onClearSelection: () => void;
  /** The month the host is currently looking at, reported as they scroll. */
  onVisibleMonthChange: (month: string) => void;
  /** Owned by the workspace so its month controls can scroll this pane. */
  scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * The whole horizon as one scrollable column of months.
 *
 * Every month is mounted rather than virtualized: eighteen months is roughly seven
 * hundred cells, which the browser lays out once and then leaves alone, and a
 * windowing library would buy nothing back while breaking the two things that matter
 * most here — a native `focus()` on a date in a month the host has not scrolled to, and
 * a selection that spans a month boundary. What keeps it cheap is that each month is
 * memoized and only sees a selection that actually reaches it.
 */
export function CalendarMonthStream({
  listing,
  index,
  formats,
  today,
  horizonEnd,
  months,
  selection,
  focusedDate,
  onFocusDate,
  onSelectDate,
  onExtendSelection,
  onSelectRange,
  onClearSelection,
  onVisibleMonthChange,
  scrollRef,
}: CalendarMonthStreamProps) {
  const i18n = useI18n();
  const weekdays = weekdayLabels(formats);
  const frame = useRef(0);

  const drag = useDragSelect({
    scrollRef,
    today,
    horizonEnd,
    cancelKey: listing.id,
    onSelectRange,
  });

  /**
   * The run the grid paints. A drag in flight shows its own preview and the committed
   * selection stays untouched behind it — nothing is decided until the pointer is
   * released, and the release still goes through the workspace's unsaved-work guard.
   * `aria-pressed` follows this, so what a screen reader reports is what is on screen.
   */
  const paintedSelection = drag.preview ?? selection;

  const moveFocus = useCallback(
    (from: string, days: number, extend: boolean) => {
      const next = addDaysToYmd(from, days);
      if (compareYmd(next, today) < 0) return;
      if (compareYmd(next, horizonEnd) >= 0) return;
      onFocusDate(next);
      if (extend) onExtendSelection(from, next);
      // Every month is mounted, so the target cell already exists — but the roving
      // tabindex only moves to it after this render, so focus is applied afterwards.
      // The browser's own scroll-on-focus is what brings another month into view.
      requestAnimationFrame(() => {
        scrollRef.current
          ?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)
          ?.focus();
      });
    },
    [today, horizonEnd, onFocusDate, onExtendSelection, scrollRef],
  );

  /**
   * Measured in viewport coordinates rather than from `scrollTop`, because the pane is
   * its own scroller only from `md` up — on a phone the document scrolls it instead,
   * and the reading has to be right either way. Which line a month is measured against
   * changes with it: the pane's own top when the pane scrolls, the underside of the
   * sticky chrome when the document does. Reading against the pane on a phone would
   * measure two things that move together and never change its answer.
   */
  const readVisibleMonth = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const mode = monthStreamScrollMode(scroller);
    const threshold = monthReadThreshold({
      mode,
      paneTop: scroller.getBoundingClientRect().top,
    });
    const sections = Array.from(
      scroller.querySelectorAll<HTMLElement>("[data-month]"),
    ).map((section) => ({
      month: section.dataset.month ?? "",
      top: section.getBoundingClientRect().top,
    }));
    // At maximum scroll the browser can clamp before the final section's top reaches
    // the reading line. Treat the attainable end as authoritative so the toolbar can
    // never jump back to the penultimate month after a "next" or end-of-list scroll.
    const atEnd =
      mode === "container"
        ? containerStreamAtEnd(scroller)
        : documentStreamAtEnd({
            streamBottom: scroller.getBoundingClientRect().bottom,
            viewportHeight: window.innerHeight,
          });
    const visible = atEnd
      ? (months.at(-1) ?? "")
      : pickVisibleMonth(sections, threshold, months[0] ?? "");
    if (visible) onVisibleMonthChange(visible);
  }, [months, onVisibleMonthChange, scrollRef]);

  const scheduleRead = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(readVisibleMonth);
  }, [readVisibleMonth]);

  useEffect(() => {
    window.addEventListener("scroll", scheduleRead, { passive: true });
    // A resize can move the breakpoint itself, and with it which coordinate system the
    // reading belongs to, so the label is taken again rather than left on the last
    // answer from the other layout.
    window.addEventListener("resize", scheduleRead, { passive: true });
    scheduleRead();
    return () => {
      window.removeEventListener("scroll", scheduleRead);
      window.removeEventListener("resize", scheduleRead);
      cancelAnimationFrame(frame.current);
    };
  }, [scheduleRead]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* On phones the app shell has no header. The calendar's compact `h-10` month
          toolbar is the only chrome above this row, so the weekday key pins directly
          beneath it. From `md` up the pane owns its scroll and the row stays in flow. */}
      <div
        aria-hidden
        className="sticky top-10 z-30 grid h-7 shrink-0 grid-cols-7 items-center gap-1 border-b border-slate-100 bg-white md:static md:h-auto md:pb-1.5"
      >
        {weekdays.map((label, position) => (
          <div
            key={`${label}-${position}`}
            className="text-center text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-400"
          >
            {label}
          </div>
        ))}
      </div>

      <div
        {...anchorProps(CALENDAR_ANCHOR.dateGrid)}
        ref={scrollRef}
        onScroll={scheduleRead}
        // One delegated pointer-down for the whole horizon; the cell under the pointer
        // is found by hit test from there, because a drag leaves the cell it started on.
        onPointerDown={drag.onPointerDown}
        className="relative min-h-0 select-none overscroll-contain md:flex-1 md:overflow-y-auto"
      >
        {months.map((month, position) => {
          const title = formatMonthYear(month, formats);
          return (
            <section
              key={month}
              data-month={month}
              role="group"
              aria-label={title}
              // The phone jump clears the 40px month toolbar and 28px weekday row.
              className="scroll-mt-[4.25rem] pb-2 md:scroll-mt-0"
            >
              {/* Where one month ends and the next begins. The stream ran them together
                  with only a gap between the last row and the first, which on a month
                  starting mid-week is no gap at all. `aria-hidden` because the section
                  around it is already labelled with the same words. */}
              <div
                aria-hidden
                className={cn(
                  "flex items-center gap-3 px-1 pb-2",
                  // The stream opens on a month the toolbar above is already naming, so
                  // the first caption sits tight rather than pushing the grid down.
                  position === 0 ? "pt-1" : "pt-4",
                )}
              >
                <span className="h-px flex-1 bg-slate-100" />
                <span className="shrink-0 text-[0.75rem] font-semibold tracking-wide text-slate-500">
                  {title}
                </span>
                <span className="h-px flex-1 bg-slate-100" />
              </div>
              <CalendarMonthGrid
                listing={listing}
                index={index}
                formats={formats}
                today={today}
                horizonEnd={horizonEnd}
                month={month}
                selection={
                  paintedSelection &&
                  monthIntersectsRange(month, paintedSelection)
                    ? paintedSelection
                    : null
                }
                focusedDate={monthOf(focusedDate) === month ? focusedDate : null}
                onFocusDate={onFocusDate}
                onSelectDate={onSelectDate}
                onClearSelection={onClearSelection}
                onMoveFocus={moveFocus}
              />
            </section>
          );
        })}
        <p className="pb-1 pt-2 text-center text-[0.6875rem] text-slate-400">
          {
            i18n.resolve(
              "host.v2.calendar.horizon_end",
              "That is as far ahead as your calendar is loaded.",
            ).text
          }
        </p>
      </div>
    </div>
  );
}

/** Bring a month to the top of the stream. Used by the compact month controls. */
export function scrollStreamToMonth(
  scroller: HTMLDivElement | null,
  month: string,
) {
  if (!scroller) return;
  const target = scroller.querySelector<HTMLElement>(`[data-month="${month}"]`);
  if (!target) return;
  if (monthStreamScrollMode(scroller) === "container") {
    // `offsetTop` is measured against the scroller because it is the positioned
    // ancestor, so this is the scroll offset that puts the month's first row on top.
    scroller.scrollTop = containerScrollTop(target.offsetTop);
    return;
  }
  // Below `md` the pane is not its own scroller — the document is, and the top of the
  // viewport is occupied by the calendar toolbar and weekday row. A plain
  // `scrollIntoView({ block: "start" })` puts the month's caption exactly there, which
  // is to say behind them, so the offset is taken off the target explicitly.
  window.scrollTo({
    top: documentScrollTop({
      sectionTop: target.getBoundingClientRect().top,
      scrollY: window.scrollY,
    }),
  });
}

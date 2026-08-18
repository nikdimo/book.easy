"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  autoScrollStep,
  beginDrag,
  cancelDrag,
  completeDrag,
  dragPreview,
  dragToDate,
  type DragBounds,
  type DragCompletion,
  type DragState,
} from "@/lib/host/v2/calendar-drag";
import type { CalendarSelection } from "@/lib/host/v2/calendar-selection";
import { monthStreamScrollMode } from "@/lib/host/v2/calendar-scroll";

/**
 * Drag-to-select for the month stream.
 *
 * One `pointerdown` handler on the scroller, delegated by `data-date`, rather than a
 * handler per cell: the horizon mounts roughly seven hundred of them at once, and the
 * cell under the pointer has to be found from coordinates anyway once the drag leaves
 * the one it started on. The move/up/cancel listeners are global because a drag that
 * leaves the pane still belongs to the pane — but they exist only while a drag does,
 * and they are torn down by the same function on release, cancellation, a property
 * switch and unmount, so there is exactly one path that can leave them behind.
 *
 * **Touch is deliberately not a drag.** The stream scrolls vertically under the same
 * finger a drag would need, and the only ways to tell the two apart — swallowing the
 * first movement to see where it goes, or claiming the gesture with `touch-action` —
 * either delay every scroll or take page scrolling away from the host outright. Touch
 * keeps tap, then tap, which selects the same inclusive range with no ambiguity to
 * resolve. Mouse and pen, which have no such conflict, drag.
 */
export function useDragSelect({
  scrollRef,
  today,
  horizonEnd,
  cancelKey,
  onSelectRange,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  today: string;
  /** Exclusive end of the loaded window. */
  horizonEnd: string;
  /** Changing this cancels any drag in flight — the listing the host is looking at. */
  cancelKey: string;
  /** Called once, on release, with the completed inclusive run and the end it grew from. */
  onSelectRange: (selection: CalendarSelection, anchor: string) => void;
}) {
  const [preview, setPreview] = useState<CalendarSelection | null>(null);
  const stateRef = useRef<DragState | null>(null);
  /** The last pointer position, so the auto-scroll frame can re-read the cell. */
  const pointRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef(0);
  /** Set on release, read and cleared by the very next click. */
  const suppressClickRef = useRef(false);
  /** Removes every listener and frame this drag owns. The only teardown path. */
  const detachRef = useRef<(() => void) | null>(null);

  // Mirrored so the listeners attached at pointer-down never have to be re-attached
  // when the horizon or the callback identity changes mid-drag.
  const boundsRef = useRef<DragBounds>({ today, horizonEnd });
  const onSelectRangeRef = useRef(onSelectRange);
  useEffect(() => {
    boundsRef.current = { today, horizonEnd };
    onSelectRangeRef.current = onSelectRange;
  }, [today, horizonEnd, onSelectRange]);

  /** The date cell under a viewport coordinate, if it is one of ours and enabled. */
  const dateAtPoint = useCallback(
    (x: number, y: number): string | null => {
      const scroller = scrollRef.current;
      if (!scroller) return null;
      const element = document.elementFromPoint(x, y);
      const cell = element?.closest?.<HTMLElement>("[data-date]") ?? null;
      if (!cell || !scroller.contains(cell)) return null;
      if (cell instanceof HTMLButtonElement && cell.disabled) return null;
      return cell.dataset.date ?? null;
    },
    [scrollRef],
  );

  const readPoint = useCallback(
    (x: number, y: number) => {
      const state = stateRef.current;
      if (!state) return;
      const date = dateAtPoint(x, y);
      if (!date) return;
      const next = dragToDate(state, date, boundsRef.current);
      if (next === state) return;
      stateRef.current = next;
      setPreview(dragPreview(next));
    },
    [dateAtPoint],
  );

  const finish = useCallback((completion: DragCompletion) => {
    stateRef.current = null;
    detachRef.current?.();
    detachRef.current = null;
    setPreview(null);
    suppressClickRef.current = completion.suppressClick;
    if (completion.selection && completion.anchor) {
      onSelectRangeRef.current(completion.selection, completion.anchor);
    }
  }, []);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Touch scrolls; see the note above. Secondary buttons open menus.
      if (event.pointerType === "touch" || event.button !== 0) return;
      if (stateRef.current) return;
      const target = event.target as HTMLElement | null;
      const cell = target?.closest?.<HTMLElement>("[data-date]") ?? null;
      const scroller = scrollRef.current;
      if (!cell || !scroller?.contains(cell)) return;
      if (cell instanceof HTMLButtonElement && cell.disabled) return;
      const date = cell.dataset.date;
      if (!date) return;

      const started = beginDrag(
        { date, pointerId: event.pointerId },
        boundsRef.current,
      );
      // A past or beyond-horizon cell starts nothing at all: no listeners, no frame,
      // and the click still reaches the grid so it can say why the date was refused.
      if (!started) return;
      stateRef.current = started;
      pointRef.current = { x: event.clientX, y: event.clientY };

      const onMove = (moveEvent: PointerEvent) => {
        const state = stateRef.current;
        if (!state || moveEvent.pointerId !== state.pointerId) return;
        pointRef.current = { x: moveEvent.clientX, y: moveEvent.clientY };
        readPoint(moveEvent.clientX, moveEvent.clientY);
      };
      const onUp = (upEvent: PointerEvent) => {
        const state = stateRef.current;
        if (state && upEvent.pointerId !== state.pointerId) return;
        finish(completeDrag(state));
      };
      const onCancel = () => finish(cancelDrag(stateRef.current));
      const onKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape") finish(cancelDrag(stateRef.current));
      };

      const tick = () => {
        const state = stateRef.current;
        const pane = scrollRef.current;
        if (!state || !pane) return;
        const mode = monthStreamScrollMode(pane);
        const rect = pane.getBoundingClientRect();
        const step = autoScrollStep({
          pointerY: pointRef.current.y,
          top: mode === "container" ? rect.top : 0,
          bottom: mode === "container" ? rect.bottom : window.innerHeight,
        });
        if (step !== 0) {
          if (mode === "container") pane.scrollTop += step;
          else window.scrollBy(0, step);
          // The cells have moved under a stationary pointer, so the run has to be
          // re-read from the same coordinate or the preview stops at the edge.
          readPoint(pointRef.current.x, pointRef.current.y);
        }
        frameRef.current = requestAnimationFrame(tick);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("blur", onCancel);
      frameRef.current = requestAnimationFrame(tick);

      detachRef.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("blur", onCancel);
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      };
    },
    [scrollRef, readPoint, finish],
  );

  /**
   * Swallow the click a completed drag leaves behind.
   *
   * One listener for the component's lifetime, on the window rather than the pane: a
   * drag released outside the calendar still produces a click, but it is dispatched at
   * the common ancestor of press and release, which a handler on the pane would never
   * see — leaving the flag set to ambush the host's next real click. Capture phase, so
   * the click never reaches a cell's own handler, where it would be read as "click on
   * a completed range" and start a fresh single-date selection over the run just drawn.
   * One click only; the next one is a real one.
   */
  useEffect(() => {
    const swallowClick = (event: MouseEvent) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    };
    // A fresh press means the click the last gesture owed is never coming — a drag
    // the system cancelled produces no click at all — so the debt is written off
    // rather than charged to whatever the host presses next, anywhere on the page.
    const clearDebt = () => {
      suppressClickRef.current = false;
    };
    window.addEventListener("click", swallowClick, { capture: true });
    window.addEventListener("pointerdown", clearDebt, { capture: true });
    return () => {
      window.removeEventListener("click", swallowClick, { capture: true });
      window.removeEventListener("pointerdown", clearDebt, { capture: true });
    };
  }, []);

  useEffect(() => {
    // Unmount, or the host switching property mid-drag: the dates under the pointer
    // now belong to a different calendar, so the gesture is abandoned rather than
    // finished. Torn down through the same `detach` as every other ending.
    return () => {
      const state = stateRef.current;
      stateRef.current = null;
      detachRef.current?.();
      detachRef.current = null;
      suppressClickRef.current = Boolean(state?.moved);
      setPreview(null);
    };
  }, [cancelKey]);

  return {
    /** The run to paint while dragging, or null when nothing is in flight. */
    preview,
    onPointerDown: handlePointerDown,
  };
}

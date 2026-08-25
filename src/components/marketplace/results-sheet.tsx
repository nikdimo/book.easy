"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SheetSnap = "peek" | "mid" | "full";

/**
 * How much of the sheet stays on screen at rest, in px — the handle and the count
 * line, and no more: at rest the map is what the screen is for. Anything docked
 * over the map (the selected-pin card, Leaflet's own controls) has to clear this.
 * Kept in step with the fallback in `.results-sheet` (globals.css).
 */
export const SHEET_PEEK_HEIGHT = 96;

/** Fraction of the stage the sheet leaves uncovered at the middle stop. */
const MID_RATIO = 0.46;

/** Past this speed a flick moves one stop in its direction, wherever it was let go. px/ms. */
const FLICK_VELOCITY = 0.45;

/** Movement below this is a tap, not a drag. */
const DRAG_THRESHOLD = 6;

/**
 * How long the wheel is ignored after it moves the sheet. A trackpad sends dozens
 * of events per gesture; without this the sheet would jump every stop at once.
 */
const WHEEL_LOCK_MS = 400;

/** Ordered by how much of the sheet is showing, most first. */
const SNAP_ORDER: SheetSnap[] = ["full", "mid", "peek"];

type DragState = {
  pointerId: number;
  startY: number;
  startOffset: number;
  lastY: number;
  lastTime: number;
  velocity: number;
  /** Whether this pointer has taken the gesture over from the list's own scrolling. */
  engaged: boolean;
};

/**
 * True while the viewport is narrow enough that the results are a sheet over the
 * map rather than a column beside it. The classes below do their own breakpoint
 * work; this is only for the parts CSS cannot express — the dragged transform and
 * the pointer handlers — so it starts `false` and the markup renders desktop-shaped
 * on the server either way.
 */
export function useSheetEnabled() {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia("(max-width: 1023.98px)");
    const sync = () => setEnabled(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return enabled;
}

/**
 * The results list: a draggable sheet over the map on phones, a plain column on
 * desktop. One element either way — the listings are server-rendered cards, and
 * rendering them twice to switch layouts would cost a second copy of every photo.
 *
 * Below `full` the list does not scroll, so every drag on it belongs to the sheet.
 * At `full` the list owns the gesture until it is scrolled back to the top and the
 * finger pulls down — the one coupling that makes a sheet feel like a sheet rather
 * than a panel that fights the content inside it.
 */
export function ResultsSheet({
  snap,
  onSnapChange,
  enabled,
  className,
  header,
  grabLabel,
  children,
  onListChromeVisibilityChange,
}: {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  enabled: boolean;
  className?: string;
  /** Sits under the grab handle and drags with it. */
  header: React.ReactNode;
  grabLabel: string;
  children: React.ReactNode;
  onListChromeVisibilityChange?: (visible: boolean) => void;
}) {
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  /** A drag that ends on the handle still fires a click; that click is not a tap. */
  const suppressClickRef = React.useRef(false);
  const wheelLockRef = React.useRef(0);
  const [stageHeight, setStageHeight] = React.useState(0);
  const [dragOffset, setDragOffset] = React.useState<number | null>(null);
  const lastScrollTopRef = React.useRef(0);

  React.useEffect(() => {
    const node = sheetRef.current;
    if (!node || !enabled) return;

    // Use layout pixels, not the visually scaled bounding box. The public app is
    // rendered inside `.app-zoom-90`; mixing that 0.9-scaled measurement with a
    // CSS-pixel translate leaves considerably more than the intended peek strip.
    const measure = () => setStageHeight(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  const maxOffset = Math.max(0, stageHeight - SHEET_PEEK_HEIGHT);

  const offsetFor = React.useCallback(
    (value: SheetSnap) => {
      if (stageHeight === 0) return 0;
      if (value === "full") return 0;
      if (value === "peek") return maxOffset;
      return Math.min(maxOffset, Math.round(stageHeight * MID_RATIO));
    },
    [stageHeight, maxOffset]
  );

  const clampOffset = (value: number) =>
    Math.min(Math.max(value, 0), maxOffset);

  const restingOffset = offsetFor(snap);
  const offset = dragOffset ?? restingOffset;
  const positioned = enabled && stageHeight > 0;

  const resolveSnap = (settled: number, velocity: number): SheetSnap => {
    let nearest = SNAP_ORDER[0]!;
    for (const candidate of SNAP_ORDER) {
      if (
        Math.abs(offsetFor(candidate) - settled) <
        Math.abs(offsetFor(nearest) - settled)
      ) {
        nearest = candidate;
      }
    }

    if (Math.abs(velocity) < FLICK_VELOCITY) return nearest;
    // A pointer moving down is heading for `peek`, which is later in SNAP_ORDER.
    const step = velocity > 0 ? 1 : -1;
    const index = SNAP_ORDER.indexOf(nearest) + step;
    return SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, Math.max(0, index))]!;
  };

  const beginDrag = (
    event: React.PointerEvent<HTMLElement>,
    source: "grab" | "content"
  ) => {
    if (!positioned || event.button !== 0) return;

    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: restingOffset,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      engaged: source === "grab",
    };

    if (source === "grab") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragOffset(restingOffset);
    }
  };

  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (!drag.engaged) {
      const delta = event.clientY - drag.startY;
      const atTop = (scrollerRef.current?.scrollTop ?? 0) <= 0;
      const engages =
        snap === "full"
          ? delta > DRAG_THRESHOLD && atTop
          : Math.abs(delta) > DRAG_THRESHOLD;
      if (!engages) return;

      drag.engaged = true;
      drag.startY = event.clientY;
      drag.startOffset = restingOffset;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const elapsed = event.timeStamp - drag.lastTime;
    if (elapsed > 0) {
      drag.velocity = (event.clientY - drag.lastY) / elapsed;
      drag.lastY = event.clientY;
      drag.lastTime = event.timeStamp;
    }

    const moved = drag.startOffset + (event.clientY - drag.startY);
    if (Math.abs(event.clientY - drag.startY) > DRAG_THRESHOLD) {
      suppressClickRef.current = true;
    }
    setDragOffset(clampOffset(moved));
  };

  /**
   * A wheel or trackpad is the other way the sheet moves, and on a laptop it is the
   * only one. Scrolling down over the results reaches for more of them, so it opens
   * the sheet a stop at a time; scrolling back up past the top of the list closes it
   * again. Over the map the wheel never reaches here — that is Leaflet's zoom.
   */
  const handleWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (!positioned || event.deltaY === 0) return;

    // At `full` the list is what scrolls. The sheet only takes the wheel back once
    // the list has run out of room and the wheel is still pushing up.
    const atTop = (scrollerRef.current?.scrollTop ?? 0) <= 0;
    if (snap === "full" && !(event.deltaY < 0 && atTop)) return;

    if (event.timeStamp < wheelLockRef.current) return;
    wheelLockRef.current = event.timeStamp + WHEEL_LOCK_MS;

    const step = event.deltaY > 0 ? -1 : 1;
    const index = SNAP_ORDER.indexOf(snap) + step;
    const next =
      SNAP_ORDER[Math.min(SNAP_ORDER.length - 1, Math.max(0, index))]!;
    if (next !== snap) onSnapChange(next);
  };

  const endDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId) return;

    setDragOffset(null);
    if (!drag.engaged) return;

    const settled = clampOffset(
      drag.startOffset + (event.clientY - drag.startY)
    );
    const next = resolveSnap(settled, drag.velocity);
    if (next !== snap) onSnapChange(next);
  };

  const handleListScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (snap !== "full") return;
    const nextTop = event.currentTarget.scrollTop;
    const delta = nextTop - lastScrollTopRef.current;
    lastScrollTopRef.current = nextTop;

    if (nextTop <= 8 || delta < -6) {
      onListChromeVisibilityChange?.(true);
    } else if (nextTop > 28 && delta > 6) {
      onListChromeVisibilityChange?.(false);
    }
  };

  return (
    <div
      ref={sheetRef}
      className={cn(
        "min-w-0 flex-1",
        // On phones the sheet is the whole stage, parked most of the way down it.
        // `results-sheet` (globals.css) owns the transform, under the same
        // breakpoint as these classes; here we only feed it an offset.
        "results-sheet",
        "max-lg:absolute max-lg:inset-0 max-lg:z-20 max-lg:flex max-lg:flex-col",
        "max-lg:rounded-t-2xl max-lg:border-t max-lg:border-border max-lg:bg-background",
        "max-lg:shadow-[0_-10px_30px_rgba(15,23,42,0.14)]",
        "max-lg:will-change-transform",
        dragOffset === null &&
          "max-lg:transition-transform max-lg:duration-[420ms] max-lg:[transition-timing-function:cubic-bezier(0.22,0.78,0.22,1)] motion-reduce:max-lg:duration-0",
        className
      )}
      style={
        positioned
          ? ({ "--sheet-offset": `${offset}px` } as React.CSSProperties)
          : undefined
      }
      onWheel={handleWheel}
    >
      {/* The whole strip is the target, not just the handle: at rest this is all
          there is of the sheet, and a tap anywhere on it is a tap on the results. */}
      <button
        type="button"
        aria-label={grabLabel}
        aria-expanded={snap === "full"}
        className="block w-full shrink-0 cursor-grab touch-none select-none px-4 pt-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
        onPointerDown={(event) => beginDrag(event, "grab")}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClick={() => {
          if (suppressClickRef.current) return;
          onSnapChange(snap === "full" ? "peek" : "full");
        }}
      >
        <span aria-hidden className="mx-auto mb-2 block h-1 w-9 rounded-full bg-border" />
        {header}
      </button>

      <div
        ref={scrollerRef}
        className={cn(
          "min-w-0 max-lg:min-h-0 max-lg:flex-1",
          snap === "full"
            ? "max-lg:overflow-y-auto max-lg:overscroll-contain"
            : "max-lg:overflow-hidden"
        )}
        // Only at `full` does the list scroll itself; below it the browser must
        // keep its hands off the gesture so the sheet can follow the finger.
        style={positioned && snap !== "full" ? { touchAction: "none" } : undefined}
        onPointerDown={(event) => beginDrag(event, "content")}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onScroll={handleListScroll}
      >
        {children}
      </div>
    </div>
  );
}

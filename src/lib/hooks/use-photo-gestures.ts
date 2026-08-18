"use client";

import { useCallback, useRef, useState } from "react";
import type { CSSProperties, RefObject, TouchEvent } from "react";

const MAX_SCALE = 3;
/** Horizontal travel that counts as "next/previous photo". */
const SWIPE_THRESHOLD = 40;
/** Downward travel that counts as "close the viewer". */
const DISMISS_THRESHOLD = 110;
/** Drag distance at which the backdrop has faded as far as it goes. */
const DISMISS_FADE_RANGE = 240;
const TAP_SLOP = 10;
const TAP_MS = 250;

interface PhotoGestureOptions {
  /** The touch surface, measured to keep a zoomed photo inside its frame. */
  containerRef: RefObject<HTMLElement | null>;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
  /** A clean tap with no drag — used to toggle the viewer chrome. */
  onTap: () => void;
}

type Gesture = {
  mode: "pan" | "pinch";
  startX: number;
  startY: number;
  startOffset: { x: number; y: number };
  startScale: number;
  startDistance: number;
  startedAt: number;
  moved: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function touchDistance(touches: TouchEvent["touches"]) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy) || 1;
}

/**
 * Touch handling for a fullscreen photo: pinch to zoom, drag to pan while
 * zoomed, swipe sideways to change photo, swipe down to dismiss, tap to toggle
 * chrome. Attach `handlers` to the touch surface (the element `containerRef`
 * points at) and `style` to the element wrapping the photo itself.
 *
 * The container needs `touch-action: none` — React listens to touchmove
 * passively, so the browser's own scroll/zoom can only be suppressed in CSS.
 */
export function usePhotoGestures({
  containerRef,
  onNext,
  onPrev,
  onDismiss,
  onTap,
}: PhotoGestureOptions) {
  const gesture = useRef<Gesture | null>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const [active, setActive] = useState(false);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragY(0);
  }, []);

  /** Keep a zoomed photo from being dragged away from its own frame. */
  const clampOffset = useCallback((next: { x: number; y: number }, atScale: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return next;
    const maxX = (rect.width * (atScale - 1)) / 2;
    const maxY = (rect.height * (atScale - 1)) / 2;
    return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }, [containerRef]);

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    setActive(true);

    if (e.touches.length >= 2) {
      gesture.current = {
        mode: "pinch",
        startX: 0,
        startY: 0,
        startOffset: offset,
        startScale: scale,
        startDistance: touchDistance(e.touches),
        startedAt: Date.now(),
        moved: true,
      };
      return;
    }

    gesture.current = {
      mode: "pan",
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      startOffset: offset,
      startScale: scale,
      startDistance: 0,
      startedAt: Date.now(),
      moved: false,
    };
  }

  function onTouchMove(e: TouchEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;

    if (g.mode === "pinch") {
      if (e.touches.length < 2) return;
      const next = clamp((touchDistance(e.touches) / g.startDistance) * g.startScale, 1, MAX_SCALE);
      setScale(next);
      setOffset(next === 1 ? { x: 0, y: 0 } : clampOffset(g.startOffset, next));
      return;
    }

    if (e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - g.startX;
    const dy = e.touches[0].clientY - g.startY;
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) g.moved = true;

    if (g.startScale > 1) {
      setOffset(clampOffset({ x: g.startOffset.x + dx, y: g.startOffset.y + dy }, g.startScale));
    } else if (dy > 0 && dy > Math.abs(dx)) {
      setDragY(dy);
    }
  }

  function onTouchEnd(e: TouchEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g) return;
    // Fingers still down (e.g. lifting one out of a pinch) — wait for the last one.
    if (e.touches.length > 0) return;

    gesture.current = null;
    setActive(false);

    if (g.mode === "pinch") {
      if (scale <= 1.05) reset();
      return;
    }
    // Panning around a zoomed photo never navigates or dismisses.
    if (g.startScale > 1) return;

    const dx = e.changedTouches[0].clientX - g.startX;
    const dy = e.changedTouches[0].clientY - g.startY;
    setDragY(0);

    if (Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) onNext();
      else onPrev();
      return;
    }

    if (dy >= DISMISS_THRESHOLD) {
      onDismiss();
      return;
    }

    if (!g.moved && Date.now() - g.startedAt < TAP_MS) onTap();
  }

  // Dragging down fades the photo out as it goes, so the gesture reads as
  // "letting go of it" rather than sliding it off screen.
  const dismissProgress = Math.min(dragY / DISMISS_FADE_RANGE, 1);

  const style: CSSProperties = {
    transform: `translate3d(${offset.x}px, ${offset.y + dragY}px, 0) scale(${scale})`,
    opacity: 1 - dismissProgress * 0.75,
    transition: active ? "none" : "transform 200ms ease-out, opacity 200ms ease-out",
  };

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    style,
    zoomed: scale > 1,
    reset,
  };
}

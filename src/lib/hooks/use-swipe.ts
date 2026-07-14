"use client";

import { useRef } from "react";
import type { TouchEvent, MouseEvent } from "react";

/**
 * Detects a horizontal touch swipe and swallows the ghost click some mobile
 * browsers still fire after a touch drag, so swiping doesn't also trigger
 * whatever onClick sits on the same element (e.g. opening a dialog, following a link).
 */
export function useSwipe(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  threshold = 40
) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  function onTouchStart(e: TouchEvent) {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    swiped.current = false;
  }

  function onTouchEnd(e: TouchEvent) {
    if (!start.current) return;
    const dx = e.changedTouches[0].clientX - start.current.x;
    const dy = e.changedTouches[0].clientY - start.current.y;
    start.current = null;

    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return;

    swiped.current = true;
    if (dx < 0) onSwipeLeft();
    else onSwipeRight();
  }

  function onClickCapture(e: MouseEvent) {
    if (swiped.current) {
      e.preventDefault();
      e.stopPropagation();
      swiped.current = false;
    }
  }

  return { onTouchStart, onTouchEnd, onClickCapture };
}

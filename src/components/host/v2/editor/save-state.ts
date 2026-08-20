"use client";

import { useSyncExternalStore } from "react";

/**
 * The header's "Saving… / Saved" indicator.
 *
 * A module-level store rather than context, because the header lives in the layout and
 * the thing that actually saves lives in the page — two separate React trees under the
 * same route. Threading a provider between them would mean making the layout a client
 * component just to hold one string.
 */
export type SaveState = "idle" | "saving" | "saved" | "error";

let state: SaveState = "idle";
/** Concurrent saves are normal here: a drag can land while an upload is still
 *  committing. "Saved" must wait for the last one, not the first. */
let inFlight = 0;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit(next: SaveState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): SaveState {
  return state;
}

function getServerSnapshot(): SaveState {
  return "idle";
}

export function useSaveState(): SaveState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function beginSave() {
  inFlight += 1;
  if (settleTimer) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  emit("saving");
}

export function endSave(failed = false) {
  inFlight = Math.max(0, inFlight - 1);
  if (inFlight > 0) return;
  if (failed) {
    emit("error");
    return;
  }
  emit("saved");
  // "Saved" is an acknowledgement, not a permanent state. Fading it back to nothing keeps
  // the header from carrying a stale claim for the rest of the session.
  settleTimer = setTimeout(() => {
    if (inFlight === 0 && state === "saved") emit("idle");
  }, 2500);
}

/** Wraps one autosaving action so the header reflects it without every call site
 *  remembering to pair begin with end. */
export async function withSaveState<T>(work: () => Promise<T>): Promise<T> {
  beginSave();
  try {
    const result = await work();
    endSave(
      typeof result === "object" && result !== null && "error" in result
        ? Boolean((result as { error?: unknown }).error)
        : false,
    );
    return result;
  } catch (error) {
    endSave(true);
    throw error;
  }
}

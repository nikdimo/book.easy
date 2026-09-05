/**
 * `localStorage`, for the things it is actually good for.
 *
 * The panel keeps a handful of per-browser conveniences there — which listings view was
 * last used, how large the photo thumbnails are, whether the property rail is collapsed.
 * All of them are read inside a `useSyncExternalStore` snapshot, which runs during
 * render, and that is what makes the guard load-bearing rather than defensive: Safari's
 * private mode and Chrome's "block all cookies" throw a `SecurityError` on the property
 * *access* itself, not on the value, so an unguarded read took an entire screen to the
 * error boundary over a remembered preference. Two of the three call sites had no guard.
 *
 * Writes are guarded for the same reason and swallowed for a different one: the caller
 * has already updated its in-memory cache, so losing the write costs the memory of the
 * choice, never the choice itself.
 */

/** The stored string, or null when there is none — or no storage to read it from. */
export function readStoredValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** True when the value was actually stored, for a caller that wants to know. */
export function writeStoredValue(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

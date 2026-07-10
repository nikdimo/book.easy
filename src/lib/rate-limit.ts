import "server-only";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Opportunistic cleanup so the map doesn't grow unbounded — runs at most once/minute,
// piggy-backed on normal rateLimit() calls rather than a timer.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory rate limiter. This app runs as a single Node process under
 * systemd (see scripts/deploy-remote.sh) — an in-memory limiter is genuinely sufficient
 * here. If the app ever scales to multiple instances, swap this for a Redis-backed one;
 * the call sites don't need to change.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { success: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { success: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { success: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/** Best-effort client IP for unauthenticated endpoints, assuming a reverse proxy sets
 * X-Forwarded-For (standard for this app's VPS deployment behind Nginx/Caddy). Falls
 * back to a shared bucket if absent rather than failing open with an unlimited bucket
 * per request. */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

"use client";

import { useCallback, useEffect, useState } from "react";

export interface AttentionSummary {
  unreadNotifications: number;
  host: {
    total: number;
    pendingBookings: number;
    unreadThreads: number;
    damageReports: number;
  } | null;
}

export function useAttentionSummary(enabled = true) {
  const [summary, setSummary] = useState<AttentionSummary | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled || document.visibilityState !== "visible") return;
    const response = await fetch("/api/attention", { cache: "no-store" });
    if (response.ok) setSummary((await response.json()) as AttentionSummary);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const initial = window.setTimeout(() => void refresh(), 0);
    const poller = window.setInterval(() => void refresh(), 15_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(poller);
      window.clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled, refresh]);

  return { summary, refresh };
}

/**
 * The one count badge in the app: the bell's unread count, the hosting switch, the
 * host sidebar and the account menu all render this, so a "3" means the same thing
 * and looks the same wherever it appears. Brand terracotta rather than the
 * destructive red — an unread notification is something to look at, not an error.
 *
 * Callers that float it over an icon add `ring-2 ring-background` so the pill reads
 * as separate from the strokes underneath it.
 */
export function CountBadge({
  value,
  label,
  className = "",
}: {
  value: number | undefined;
  label: string;
  className?: string;
}) {
  if (!value) return null;
  return (
    <span
      aria-label={`${value} ${label}`}
      className={`pointer-events-none inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-primary px-[3px] text-[9px] font-semibold leading-none text-primary-foreground tabular-nums lg:h-[17px] lg:min-w-[17px] lg:text-[10px] ${className}`}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

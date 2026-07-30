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
      className={`inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground ${className}`}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

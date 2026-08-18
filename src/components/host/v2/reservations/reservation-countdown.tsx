"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/host/booking-action-queue";

/**
 * A deadline that visibly shrinks while the host reads it.
 *
 * It starts from a string the server rendered, so the first client paint matches the
 * markup exactly — computing the label from `Date.now()` during render would produce a
 * different number on the client than the server sent and fail hydration on every card.
 * Thirty seconds is fine as a tick: `formatCountdown` only shows minutes under an hour,
 * so a deadline two days out has nothing to redraw anyway.
 */
export function ReservationCountdown({
  dueAt,
  initial,
}: {
  dueAt: string;
  initial: string;
}) {
  const [label, setLabel] = useState(initial);

  useEffect(() => {
    const due = new Date(dueAt).getTime();
    const tick = () => setLabel(formatCountdown(due - Date.now()));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [dueAt]);

  return (
    <span translate="no" className="tabular-nums">
      {label}
    </span>
  );
}

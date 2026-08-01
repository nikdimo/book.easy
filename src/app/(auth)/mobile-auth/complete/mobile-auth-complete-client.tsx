"use client";

import { useEffect } from "react";

export default function MobileAuthCompleteClient({
  handoff,
  native,
}: {
  handoff: string | null;
  native: boolean;
}) {
  useEffect(() => {
    if (native && handoff) {
      window.location.replace(`propertyhost://auth?handoff=${encodeURIComponent(handoff)}`);
      return;
    }
    const timer = window.setTimeout(() => window.close(), 250);
    return () => window.clearTimeout(timer);
  }, [handoff, native]);

  return (
    <div className="rounded-3xl border bg-card p-8 text-center shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Mobile host workspace
      </p>
      <h1 className="mt-3 text-xl font-semibold">You are connected</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {native
          ? "Return to the mobile app to continue."
          : "Return to the mobile preview. You can close this window if it remains open."}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { signIn } from "next-auth/react";

export default function MobileGoogleAuthPage() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void signIn("google", { callbackUrl: "/mobile-auth/complete" });
  }, []);

  return (
    <div className="rounded-3xl border bg-card p-8 text-center shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Mobile host workspace
      </p>
      <h1 className="mt-3 text-xl font-semibold">Connecting to Google…</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Complete sign-in here. This window will close automatically.
      </p>
    </div>
  );
}

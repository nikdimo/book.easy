"use client";

import { useEffect, useRef } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

export default function MobileGoogleAuthPage() {
  const started = useRef(false);
  const params = useSearchParams();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const native = params.get("native") === "1";
    void signIn("google", {
      callbackUrl: native ? "/mobile-auth/complete?native=1" : "/mobile-auth/complete",
    });
  }, [params]);

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

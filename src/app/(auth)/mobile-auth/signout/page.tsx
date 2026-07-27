"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";

export default function MobileSignOutPage() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void signOut({ callbackUrl: "/mobile-auth/complete" });
  }, []);

  return (
    <div className="rounded-3xl border bg-card p-8 text-center shadow-xl">
      <h1 className="text-xl font-semibold">Signing out…</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This window will close automatically.
      </p>
    </div>
  );
}

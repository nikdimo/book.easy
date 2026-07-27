"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

export function EmailAuthClient({ email }: { email: string }) {
  const started = useRef(false);
  const [state, setState] = useState<"sending" | "sent" | "error">("sending");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void signIn("nodemailer", {
      email,
      redirect: false,
      callbackUrl: "/mobile-auth/complete",
    }).then((result) => setState(result?.error ? "error" : "sent"));
  }, [email]);

  return (
    <div className="rounded-3xl border bg-card p-8 text-center shadow-xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        Mobile host workspace
      </p>
      <h1 className="mt-3 text-xl font-semibold">
        {state === "sending"
          ? "Sending your secure link…"
          : state === "sent"
            ? "Check your inbox"
            : "We could not send the link"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {state === "sent"
          ? `Open the sign-in link sent to ${email}. You can close this window afterwards.`
          : state === "error"
            ? "Close this window and try again from the mobile preview."
            : "Please keep this window open for a moment."}
      </p>
    </div>
  );
}

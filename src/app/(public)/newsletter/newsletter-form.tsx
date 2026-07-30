"use client";

import { useState } from "react";
import { Tx } from "@/lib/i18n/client";

export function NewsletterForm() {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setMessage("");
    const response = await fetch("/api/marketing/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        audience: formData.get("audience"),
        consent: formData.get("consent") === "on",
      }),
    });
    const result = (await response.json()) as { error?: string; message?: string };
    setMessage(result.message || result.error || "Something went wrong.");
    setPending(false);
  }

  return (
    <form action={submit} className="mt-8 space-y-5">
      <label className="block">
        <span className="text-sm font-medium">
          <Tx k="newsletter.email_address" source="Email address" />
        </span>
        <input
          required
          type="email"
          name="email"
          autoComplete="email"
          className="mt-2 w-full rounded-lg border bg-background px-4 py-3"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">
          <Tx k="newsletter.interest" source="I am interested in" />
        </span>
        <select name="audience" className="mt-2 w-full rounded-lg border bg-background px-4 py-3">
          <option value="GUEST">
            <Tx k="newsletter.guest_offers" source="Travel and guest offers" />
          </option>
          <option value="HOST">
            <Tx k="newsletter.host_offers" source="Hosting news and offers" />
          </option>
        </select>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input required type="checkbox" name="consent" className="mt-1 h-4 w-4" />
        <span>
          <Tx
            k="newsletter.consent"
            source="I would like to receive inspiration, special offers and news from Linger Homes by email. I can unsubscribe at any time."
          />
        </span>
      </label>
      <button
        disabled={pending}
        className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send confirmation email"}
      </button>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </form>
  );
}

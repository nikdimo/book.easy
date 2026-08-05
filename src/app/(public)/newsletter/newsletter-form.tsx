"use client";

import { useState } from "react";
import { Tx, useI18n } from "@/lib/i18n/client";
import { Checkbox } from "@/components/ui/checkbox";

export function NewsletterForm() {
  const t = useI18n();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/marketing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          audience: formData.get("audience"),
          consent: formData.get("consent") === "on",
        }),
      });
      if (response.ok) {
        setMessage(
          t.resolve(
            "newsletter.request_success",
            "Please check your inbox and confirm your subscription within 48 hours."
          ).text
        );
        setSubmitted(true);
      } else {
        setMessage(
          response.status === 429
            ? t.resolve(
                "newsletter.error.rate_limit",
                "Too many confirmation requests. Please try again later."
              ).text
            : response.status === 400
              ? t.resolve(
                  "newsletter.error.invalid",
                  "Enter a valid email and accept the marketing consent."
                ).text
              : t.resolve(
                  "newsletter.error.generic",
                  "Something went wrong. Please try again."
                ).text
        );
      }
    } catch {
      setMessage(
        t.resolve(
          "newsletter.error.network",
          "We could not send the request. Check your connection and try again."
        ).text
      );
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <p role="status" className="mt-8 rounded-xl border p-5">
        <Tx k="newsletter.thank_you" source="Thank you." />{" "}
        {message || "Please check your inbox and confirm your subscription."}
      </p>
    );
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
        <Checkbox required name="consent" className="mt-1" />
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
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    </form>
  );
}

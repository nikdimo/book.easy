"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { SelectField } from "@/components/shared/select-field";

const fields = "mt-2 w-full rounded-lg border bg-background px-4 py-3";

export function ContactForm() {
  const t = useI18n();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [category, setCategory] = useState("GENERAL");

  async function submit(formData: FormData) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      if (!response.ok) {
        const errorMessage =
          response.status === 429
            ? t.resolve("contact.error.rate_limit", "Too many messages. Please try again later.").text
            : response.status === 413
              ? t.resolve("contact.error.too_large", "Message is too large.").text
              : response.status === 400
                ? t.resolve("contact.error.invalid", "Please complete all fields correctly.").text
                : t.resolve("contact.error.generic", "Something went wrong. Please try again.").text;
        setMessage(errorMessage);
        return;
      }
      setSent(true);
      setMessage(
        t.resolve("contact.success", "Thank you. Your message has been sent.").text
      );
    } catch {
      setMessage(
        t.resolve(
          "contact.error.network",
          "We could not send your message. Check your connection and try again."
        ).text
      );
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <section role="status" className="mt-8 rounded-xl border p-5">
        <h2 className="font-semibold">
          {t.resolve("contact.success_title", "Message received").text}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </section>
    );
  }

  const general = t.resolve("contact.category.general", "General question").text;
  const booking = t.resolve("contact.category.booking", "Booking").text;
  const hosting = t.resolve("contact.category.hosting", "Hosting").text;
  const technical = t.resolve("contact.category.technical", "Technical problem").text;
  const other = t.resolve("contact.category.other", "Something else").text;

  return (
    <form action={submit} className="mt-8 space-y-5">
      <label className="block">
        <span className="text-sm font-medium">{t.resolve("contact.name", "Name").text}</span>
        <input required name="name" autoComplete="name" minLength={2} maxLength={120} className={fields} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">
          {t.resolve("contact.email", "Email address").text}
        </span>
        <input required type="email" name="email" autoComplete="email" maxLength={320} className={fields} />
      </label>
      <div className="block">
        <label className="text-sm font-medium" htmlFor="contact-category">
          {t.resolve("contact.category", "What can we help with?").text}
        </label>
        {/* The application Select instead of the browser's. The value still reaches the
            API through the form, via the hidden field below — the payload is the same
            `category` string it always was. */}
        <SelectField
          id="contact-category"
          value={category}
          onValueChange={setCategory}
          options={[
            { value: "GENERAL", label: general },
            { value: "BOOKING", label: booking },
            { value: "HOSTING", label: hosting },
            { value: "TECHNICAL", label: technical },
            { value: "OTHER", label: other },
          ]}
          className={`${fields} h-auto bg-background data-[size=default]:h-auto md:data-[size=default]:h-auto`}
        />
        <input type="hidden" name="category" value={category} />
      </div>
      <label className="block">
        <span className="text-sm font-medium">
          {t.resolve("contact.subject", "Subject").text}
        </span>
        <input required name="subject" minLength={2} maxLength={160} className={fields} />
      </label>
      <label className="block">
        <span className="text-sm font-medium">
          {t.resolve("contact.message", "Message").text}
        </span>
        <textarea required name="message" minLength={10} maxLength={5000} rows={6} className={fields} />
      </label>
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px]"
      />
      <button
        disabled={pending}
        className="rounded-lg bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending
          ? t.resolve("contact.sending", "Sending…").text
          : t.resolve("contact.send", "Send message").text}
      </button>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    </form>
  );
}

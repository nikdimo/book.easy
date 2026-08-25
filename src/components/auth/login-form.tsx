"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { CircleAlert, MailCheck, X } from "lucide-react";
import { BrandLogo } from "@/components/shared/brand-logo";
import { emailSignInSchema } from "@/lib/validations/auth.schema";
import { firstZodMessage } from "@/lib/utils/zod-error";
import { Tx, useI18n } from "@/lib/i18n/client";

const RESEND_COOLDOWN_SECONDS = 30;

/* Airbnb's log-in dialog, measured off it: a 568px card, 24px gutters, a 56px field
 * with a floating label, a 48px primary button and a 48px provider button, at their
 * spacing. Only the mark and the accent colour are ours. */

export function AuthForm({
  onClose,
  localDevLogin = false,
}: {
  /** When set, the close (×) button calls this instead of linking home — used inside
   * the intercepted-route modal to dismiss back to whatever page triggered it. */
  onClose?: () => void;
  /** Server-provided; true only for an explicitly enabled non-production server. */
  localDevLogin?: boolean;
}) {
  const i18n = useI18n();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [localDevLoading, setLocalDevLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function sendMagicLink(email: string) {
    setError(null);
    setEmailLoading(true);
    const res = await signIn("nodemailer", {
      email,
      redirect: false,
      callbackUrl,
    });
    setEmailLoading(false);

    if (res?.error) {
      setError(
        i18n.resolve("auth.send_link_error", "Couldn't send the link. Please try again.").text,
      );
      return;
    }

    setSentTo(email);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl });
  }

  async function handleLocalDevLogin() {
    setError(null);
    setLocalDevLoading(true);
    const result = await signIn("local-dev-host", {
      redirect: false,
      callbackUrl,
    });
    if (result?.error) {
      setLocalDevLoading(false);
      setError("Local host login failed. Run the clean local setup and try again.");
      return;
    }
    window.location.assign(result?.url || callbackUrl);
  }

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const parsed = emailSignInSchema.safeParse({
      email: formData.get("email"),
    });
    if (!parsed.success) {
      setError(firstZodMessage(parsed.error));
      return;
    }

    await sendMagicLink(parsed.data.email);
  }

  const invalid = Boolean(error) && !sentTo;
  const closeLabel = i18n.resolve("auth.close", "Close").text;
  const closeClass =
    "absolute right-[22px] top-[22px] inline-flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted";

  return (
    <div className="relative mx-auto w-full max-w-[568px] rounded-2xl bg-card px-6 pb-6 pt-[72px] shadow-[0_8px_28px_rgba(0,0,0,0.28)]">
      {onClose ? (
        <button type="button" aria-label={closeLabel} onClick={onClose} className={closeClass}>
          <X className="size-4" strokeWidth={2.5} />
        </button>
      ) : (
        <Link href="/" aria-label={closeLabel} className={closeClass}>
          <X className="size-4" strokeWidth={2.5} />
        </Link>
      )}

      {/* Mark, then heading, then the form — the card is one centred column with the
          brand at the top of it, not a header band above a body. */}
      <BrandLogo compact className="mx-auto h-10 w-auto" />
      <h1 className="mt-[26px] text-center text-[26px] font-semibold leading-[30px] tracking-[-0.01em]">
        <Tx k="auth.heading" source="Log in or sign up" />
      </h1>

      {sentTo ? (
        <div className="mt-[42px] flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-secondary/15 p-4 text-secondary">
            <MailCheck className="size-7" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-medium">
              <Tx k="auth.check_inbox" source="Check your inbox" />
            </p>
            <p className="text-sm text-muted-foreground">
              {i18n
                .resolve(
                  "auth.email_sent_detail",
                  "We sent a sign-in link to {email}. It may take a minute to arrive — check spam too.",
                )
                .text.replace("{email}", sentTo)}
            </p>
          </div>
          <button
            type="button"
            className="mt-1 h-12 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={cooldown > 0 || emailLoading}
            onClick={() => sendMagicLink(sentTo)}
          >
            {emailLoading
              ? i18n.resolve("auth.sending", "Sending…").text
              : cooldown > 0
                ? i18n
                    .resolve("auth.resend_with_seconds", "Resend link ({seconds}s)")
                    .text.replace("{seconds}", String(cooldown))
                : i18n.resolve("auth.resend", "Resend link").text}
          </button>
          <button
            type="button"
            className="text-sm text-muted-foreground underline transition-colors hover:text-foreground"
            onClick={() => {
              setSentTo(null);
              setError(null);
            }}
          >
            <Tx k="auth.use_different_email" source="Use a different email" />
          </button>
        </div>
      ) : (
        <>
          {localDevLogin ? (
            <div className="mt-[42px] rounded-lg border border-secondary/30 bg-secondary/10 p-3">
              <p className="mb-2 text-xs font-medium text-secondary">Local development only</p>
              <button
                type="button"
                className="h-12 w-full rounded-lg bg-secondary text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                disabled={localDevLoading}
                onClick={handleLocalDevLogin}
              >
                {localDevLoading ? "Opening host panel…" : "Continue as local host"}
              </button>
            </div>
          ) : null}

          {/* The field leads. Someone arriving here already knows their email; a
              provider button first makes them read past the thing they came to do. */}
          <form
            onSubmit={handleEmailSubmit}
            noValidate
            className={localDevLogin ? "mt-6" : "mt-[42px]"}
          >
            <div className="relative">
              <input
                id="email"
                name="email"
                type="email"
                placeholder=" "
                autoComplete="email"
                aria-invalid={invalid}
                aria-describedby={invalid ? "email-error" : "email-helper"}
                onChange={() => {
                  if (error) setError(null);
                }}
                className="peer h-14 w-full rounded-lg border border-input bg-card px-3 pb-1 pt-[22px] text-base outline-none transition-colors placeholder:text-transparent focus:border-foreground focus:ring-1 focus:ring-foreground aria-invalid:border-destructive aria-invalid:bg-destructive/5 aria-invalid:focus:border-destructive aria-invalid:focus:ring-destructive"
              />
              <label
                htmlFor="email"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground transition-all peer-focus:top-[9px] peer-focus:translate-y-0 peer-focus:text-xs peer-aria-invalid:text-destructive peer-[:not(:placeholder-shown)]:top-[9px] peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs"
              >
                {i18n.resolve("auth.email_address", "Email address").text}
              </label>
            </div>

            {invalid && (
              <p
                id="email-error"
                className="mt-1.5 flex items-center gap-1.5 text-xs leading-4 text-destructive"
              >
                <CircleAlert className="size-4 shrink-0" />
                {error}
              </p>
            )}

            <p id="email-helper" className="mt-1.5 text-xs leading-4 text-muted-foreground">
              <Tx
                k="auth.email_helper"
                source="We'll email you a sign-in link — no password needed."
              />
            </p>

            <button
              type="submit"
              className="mt-4 h-12 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              disabled={emailLoading}
            >
              {emailLoading
                ? i18n.resolve("auth.sending", "Sending…").text
                : i18n.resolve("auth.continue", "Continue").text}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-4 text-xs text-muted-foreground">
                <Tx k="auth.or" source="or" />
              </span>
            </div>
          </div>

          {/* Google is the only provider wired up, so it stays a full-width button
              rather than the row of square tiles a second provider would earn. */}
          <button
            type="button"
            className="relative flex h-12 w-full items-center justify-center rounded-lg border border-foreground/80 text-base font-medium transition-colors hover:bg-muted disabled:opacity-50"
            disabled={googleLoading}
            onClick={handleGoogle}
          >
            <GoogleIcon className="absolute left-5 size-5" />
            {googleLoading
              ? i18n.resolve("auth.redirecting", "Redirecting…").text
              : i18n.resolve("auth.continue_google", "Continue with Google").text}
          </button>
        </>
      )}
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.65z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.15-4.05 1.15-3.11 0-5.75-2.1-6.69-4.93H1.3v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.31 14.31c-.25-.72-.38-1.49-.38-2.28s.14-1.56.38-2.28V6.66H1.3A11.97 11.97 0 000 12.03c0 1.93.46 3.76 1.3 5.37l4.01-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.3 6.66l4.01 3.09C6.25 6.85 8.89 4.75 12 4.75z"
      />
    </svg>
  );
}

export function LoginForm({ localDevLogin = false }: { localDevLogin?: boolean }) {
  return <AuthForm localDevLogin={localDevLogin} />;
}

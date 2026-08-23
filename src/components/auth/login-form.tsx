"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { MailCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/shared/brand-logo";
import { emailSignInSchema } from "@/lib/validations/auth.schema";
import { firstZodMessage } from "@/lib/utils/zod-error";
import { Tx, useI18n } from "@/lib/i18n/client";

const RESEND_COOLDOWN_SECONDS = 30;

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

  return (
    <div className="relative rounded-3xl bg-card p-6 shadow-[0_18px_60px_-20px_rgba(15,23,42,0.45)] ring-1 ring-black/5 sm:p-10">
      {onClose ? (
        <button
          type="button"
          aria-label={i18n.resolve("auth.close", "Close").text}
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="size-5" />
        </button>
      ) : (
        <Link
          href="/"
          aria-label={i18n.resolve("auth.close", "Close").text}
          className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="size-5" />
        </Link>
      )}

      {/* Mark, then heading, then the form — the card is one centred column with the
          brand at the top of it, not a header band above a body. */}
      <div className="flex flex-col items-center gap-5 pb-7 text-center">
        <BrandLogo compact className="h-9 w-auto" />
        <h1 className="text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[1.75rem]">
          <Tx k="auth.heading" source="Log in or sign up" />
        </h1>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg">
            {error}
          </div>
        )}

        {sentTo ? (
          <div className="flex flex-col items-center gap-3 text-center py-2">
            <div className="rounded-full bg-secondary/15 p-4 text-secondary">
              <MailCheck className="size-7" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">
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
            <Button
              type="button"
              variant="secondary"
              className="w-full h-12 rounded-xl"
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
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
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
              <div className="rounded-2xl border border-secondary/30 bg-secondary/10 p-3">
                <p className="mb-2 text-xs font-medium text-secondary">
                  Local development only
                </p>
                <Button
                  type="button"
                  className="h-12 w-full rounded-xl font-medium"
                  disabled={localDevLoading}
                  onClick={handleLocalDevLogin}
                >
                  {localDevLoading ? "Opening host panel…" : "Continue as local host"}
                </Button>
              </div>
            ) : null}

            {/* The field leads. Someone arriving here already knows their email; a
                provider button first makes them read past the thing they came to do. */}
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email" className="sr-only">
                  <Tx k="auth.email_label" source="Email" />
                </Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={i18n.resolve("auth.email_address", "Email address").text}
                  required
                  autoComplete="email"
                  className="h-14 rounded-xl px-4 text-base"
                />
              </div>
              <Button
                type="submit"
                className="h-14 w-full rounded-xl text-base font-semibold"
                disabled={emailLoading}
              >
                {emailLoading
                  ? i18n.resolve("auth.sending", "Sending…").text
                  : i18n.resolve("auth.continue", "Continue").text}
              </Button>
            </form>

            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-card px-3 text-muted-foreground">
                  <Tx k="auth.or" source="or" />
                </span>
              </div>
            </div>

            {/* Google is the only provider wired up, so it stays a full-width button
                rather than the row of square tiles a second provider would earn. */}
            <Button
              type="button"
              variant="outline"
              className="h-14 w-full gap-2 rounded-xl text-base font-medium"
              disabled={googleLoading}
              onClick={handleGoogle}
            >
              <GoogleIcon className="size-5 shrink-0" />
              {googleLoading
                ? i18n.resolve("auth.redirecting", "Redirecting…").text
                : i18n.resolve("auth.continue_google", "Continue with Google").text}
            </Button>
          </>
        )}
      </div>
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

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { emailSignInSchema } from "@/lib/validations/auth.schema";
import { firstZodMessage } from "@/lib/utils/zod-error";

const RESEND_COOLDOWN_SECONDS = 30;

export function AuthForm({
  heading,
  description,
}: {
  heading: string;
  description: string;
}) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
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
      setError("Couldn't send the link. Please try again.");
      return;
    }

    setSentTo(email);
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    await signIn("google", { callbackUrl });
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
    <Card className="border-border/60 shadow-xl shadow-black/[0.03] backdrop-blur-sm">
      <CardHeader className="text-center pb-2">
        <CardTitle className="text-2xl font-semibold tracking-tight">{heading}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
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
              <p className="text-sm font-medium">Check your inbox</p>
              <p className="text-sm text-muted-foreground">
                We sent a sign-in link to <span className="font-medium text-foreground">{sentTo}</span>.
                It may take a minute to arrive — check spam too.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full rounded-full"
              disabled={cooldown > 0 || emailLoading}
              onClick={() => sendMagicLink(sentTo)}
            >
              {emailLoading
                ? "Sending…"
                : cooldown > 0
                  ? `Resend link (${cooldown}s)`
                  : "Resend link"}
            </Button>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
              onClick={() => {
                setSentTo(null);
                setError(null);
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full gap-2 font-medium"
              disabled={googleLoading}
              onClick={handleGoogle}
            >
              <GoogleIcon className="size-4 shrink-0" />
              {googleLoading ? "Redirecting…" : "Continue with Google"}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                    className="pl-9"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full rounded-full font-medium"
                disabled={emailLoading}
              >
                {emailLoading ? "Sending…" : "Email me a sign-in link"}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
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

export function LoginForm() {
  return (
    <AuthForm
      heading="Welcome back"
      description="Log in to your book.easy.mk account"
    />
  );
}

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { MailCheck } from "lucide-react";
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
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{heading}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
            {error}
          </div>
        )}

        {sentTo ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="rounded-full bg-secondary p-3">
              <MailCheck className="size-6" />
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
              className="w-full"
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
              className="text-sm text-muted-foreground hover:underline"
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
              className="w-full"
              disabled={googleLoading}
              onClick={handleGoogle}
            >
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
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <Button
                type="submit"
                variant="secondary"
                className="w-full"
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

export function LoginForm() {
  return (
    <AuthForm
      heading="Welcome back"
      description="Log in to your book.easy.mk account"
    />
  );
}

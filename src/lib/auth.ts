import "server-only";
import { createTransport } from "nodemailer";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { rateLimit } from "@/lib/rate-limit";
import { SITE_DOMAIN } from "@/lib/branding";

// Magic-link sign-ins only carry an email, but `name` is required on User.
// Fall back to the local part of the email so the account still gets a display name.
const baseAdapter = PrismaAdapter(db);
const adapter = {
  ...baseAdapter,
  createUser: (data: { name?: string | null; email?: string | null }) =>
    (baseAdapter.createUser as (u: unknown) => unknown)({
      ...data,
      name: data.name ?? data.email?.split("@")[0] ?? "New user",
    }),
} as unknown as Adapter;

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Both providers verify the email address, so it's safe to merge
      // a Google sign-in into an existing magic-link account of the same email.
      allowDangerousEmailAccountLinking: true,
    }),
    Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 465),
        secure: Number(process.env.EMAIL_SERVER_PORT ?? 465) === 465,
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
      // Rate-limit per recipient before sending — otherwise this endpoint lets anyone
      // email-bomb an arbitrary address (no auth required to request a magic link) and
      // burns SMTP sender reputation. The UI already has a 30s resend cooldown, but
      // that's client-state only and doesn't stop a scripted caller.
      async sendVerificationRequest({ identifier: email, url, provider }) {
        const limit = rateLimit(`magic-link:${email.toLowerCase()}`, 5, 15 * 60 * 1000);
        if (!limit.success) {
          throw new Error(
            "Too many sign-in attempts for this email. Please wait a few minutes and try again."
          );
        }

        const transport = createTransport(provider.server);
        await transport.sendMail({
          to: email,
          from: provider.from,
          subject: `Sign in to ${SITE_DOMAIN}`,
          text: `Sign in to ${SITE_DOMAIN}\n${url}\n\nIf you didn't request this, you can ignore this email.`,
          html: `<p>Sign in to <strong>${SITE_DOMAIN}</strong></p><p><a href="${url}">Click here to sign in</a></p><p>If you didn't request this, you can ignore this email.</p>`,
        });
      },
    }),
  ],
});

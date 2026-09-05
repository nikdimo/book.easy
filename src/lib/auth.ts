import "server-only";
import { createTransport } from "nodemailer";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { rateLimit } from "@/lib/rate-limit";
import { PRODUCT_NAME } from "@/lib/branding";
import {
  communicationFromAddress,
  communicationReplyToAddress,
} from "@/lib/communication-brand.server";
import { getEmailT } from "@/lib/email/i18n";
import { getRequestLocale } from "@/lib/email/i18n/request-locale";
import { resolveEmailLocale } from "@/lib/email/i18n/locales";
import {
  localDevAuthEnabled,
  localDevHostEmail,
} from "@/lib/auth/local-dev-auth";

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
  events: {
    // Backfill the account's email language from the browser's locale cookie the
    // first time someone signs in. Without this, anyone who picked a language
    // before creating an account would keep getting English mail until they
    // touched the switcher again. Only fills a null — never overwrites a choice
    // already stored, which would let a shared or borrowed browser silently
    // change the language of someone's booking confirmations.
    async signIn({ user }) {
      if (!user.id) return;
      try {
        const locale = resolveEmailLocale(await getRequestLocale());
        await db.user.updateMany({
          where: { id: user.id, locale: null },
          data: { locale },
        });
      } catch (error) {
        // Never block a sign-in over an email-language preference.
        console.warn("[auth] could not backfill user locale", error);
      }
    },
  },
  providers: [
    ...(localDevAuthEnabled()
      ? [
          Credentials({
            id: "local-dev-host",
            name: "Local development host",
            credentials: {},
            async authorize() {
              const user = await db.user.findUnique({
                where: { email: localDevHostEmail() },
              });
              if (!user?.isActive || !user.isHost) return null;
              return user;
            },
          }),
        ]
      : []),
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
      from: communicationFromAddress(),
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

        // The only email sent while the recipient is still on the site, so its
        // language comes from the request rather than a stored account locale —
        // the account may not even exist yet on a first sign-in.
        const t = getEmailT(await getRequestLocale());
        const signIn = t.ti("email.signin.subject", "Sign in to {product}", {
          product: PRODUCT_NAME,
        });
        const ignore = t.t(
          "email.signin.ignore",
          "If you didn't request this, you can ignore this email."
        );

        const transport = createTransport(provider.server);
        await transport.sendMail({
          to: email,
          from: provider.from,
          replyTo: communicationReplyToAddress(),
          subject: signIn,
          text: `${signIn}\n${url}\n\n${ignore}`,
          html:
            `<p>${t.ti("email.signin.heading", "Sign in to {product}", {
              product: `<strong>${PRODUCT_NAME}</strong>`,
            })}</p>` +
            `<p><a href="${url}">${t.t("email.signin.cta", "Click here to sign in")}</a></p>` +
            `<p>${ignore}</p>`,
        });
      },
    }),
  ],
});

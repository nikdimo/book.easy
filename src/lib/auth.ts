import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { db } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";

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
    }),
  ],
});

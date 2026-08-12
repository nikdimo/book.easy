import type { NextAuthConfig } from "next-auth";

// Edge-safe subset of the auth config: no providers, no Prisma adapter.
// Middleware runs in the Edge runtime, which can't load Node-only
// dependencies like nodemailer (used by the full config in auth.ts) or
// the Prisma client. Reading the JWT session cookie doesn't need either.
function authSecret(): string {
  const fromEnv = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  const placeholder =
    "generate-a-random-secret-with-openssl-rand-base64-32";
  if (fromEnv && fromEnv !== placeholder) {
    return fromEnv;
  }
  if (process.env.NODE_ENV !== "production") {
    return "dev-only-auth-secret-not-for-production";
  }
  throw new Error(
    "Set AUTH_SECRET in .env (use a long random string; openssl rand -base64 32)"
  );
}

export const authConfig: NextAuthConfig = {
  secret: authSecret(),
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
  },
  providers: [],
  callbacks: {
    async signIn({ user }) {
      // Deactivated accounts (admin.actions.ts `deactivateUser`) must not be able to
      // sign in again, even though their existing session/JWT may still be valid.
      if ((user as { isActive?: boolean }).isActive === false) {
        return false;
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.isHost = (user as { isHost?: boolean }).isHost;
        token.displayCurrency =
          (user as { displayCurrency?: string | null }).displayCurrency ?? null;
        // The proxy runs at the edge and cannot query Prisma. Keep the account
        // language on the JWT alongside the currency so a signed-in person's
        // preference wins on the very first render on every device.
        token.locale = (user as { locale?: string | null }).locale ?? null;
      }
      if (trigger === "update" && session) {
        token.isHost = session.isHost ?? token.isHost;
        token.name = session.name ?? token.name;
        // Picking a currency while signed in refreshes the token, so the proxy stops
        // re-applying the stale account value on a browser that has no cookie yet.
        if (session.displayCurrency !== undefined) {
          token.displayCurrency = session.displayCurrency;
        }
        if (session.locale !== undefined) {
          token.locale = session.locale;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.isHost = token.isHost as boolean;
        session.user.displayCurrency = (token.displayCurrency as string | null) ?? null;
        session.user.locale = (token.locale as string | null) ?? null;
      }
      return session;
    },
  },
};

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
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role;
        token.isHost = (user as { isHost?: boolean }).isHost;
      }
      if (trigger === "update" && session) {
        token.isHost = session.isHost ?? token.isHost;
        token.name = session.name ?? token.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.isHost = token.isHost as boolean;
      }
      return session;
    },
  },
};

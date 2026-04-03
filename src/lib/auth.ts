import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";

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

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: authSecret(),
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const { db } = await import("@/lib/db");
        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.isActive) return null;

        const isValid = await compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          isHost: user.isHost,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.isHost = user.isHost;
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
});

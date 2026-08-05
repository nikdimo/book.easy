import { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      isHost: boolean;
      /** Stored display-currency preference, or null when never chosen. Carried on
       *  the JWT so the proxy can apply it at the edge without a database read. */
      displayCurrency: string | null;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: string;
    isHost: boolean;
    displayCurrency?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    isHost: boolean;
    displayCurrency?: string | null;
  }
}

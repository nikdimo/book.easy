import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export interface SessionUser {
  id: string;
  role: string;
  isHost: boolean;
  name?: string | null;
  email?: string | null;
}

async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user as SessionUser;
}

// ─── For server actions / route handlers ───────────────────────────────────────
// These throw a plain Error; the caller decides how to surface it (most actions
// in this app catch and return `{ error: message }`, matching existing convention).

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("You must be logged in to do this");
  return user;
}

export async function requireHost(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isHost && user.role !== "ADMIN") {
    throw new Error("Host access required");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new Error("Admin access required");
  }
  return user;
}

/** Throws unless `user` owns the resource (matching `resourceHostId`) or is an admin. */
export function assertOwnerOrAdmin(
  resourceHostId: string,
  user: SessionUser,
  message = "Not authorized"
): void {
  if (resourceHostId !== user.id && user.role !== "ADMIN") {
    throw new Error(message);
  }
}

// ─── For server components (pages/layouts) ─────────────────────────────────────
// These redirect instead of throwing, since a page render has nowhere to surface
// a thrown error to the user other than the generic error boundary.

export async function requireUserPage(callbackUrl?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect(
      callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login"
    );
  }
  return user;
}

export async function requireHostPage(): Promise<SessionUser> {
  const user = await requireUserPage();
  if (!user.isHost && user.role !== "ADMIN") {
    redirect("/account/become-host");
  }
  return user;
}

export async function requireAdminPage(): Promise<SessionUser> {
  const user = await requireUserPage();
  if (user.role !== "ADMIN") {
    redirect("/login");
  }
  return user;
}

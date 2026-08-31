"use server";

import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import {
  confirmAccountDeletion,
  requestAccountDeletion,
} from "@/lib/services/account-deletion.service";

export async function requestAccountDeletionAction() {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const result = await requestAccountDeletion(session.user.id);
  if (!result.ok) return { error: result.error };
  return { success: true, sentTo: result.sentTo };
}

export async function confirmAccountDeletionAction(token: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const result = await confirmAccountDeletion(token, session.user.id);
  if (!result.ok) return { error: result.error };

  // Sessions use signed JWT cookies, so deleting database Session rows does not log
  // this browser out. Remove every possible Auth.js/NextAuth session-cookie chunk in
  // the same response that confirms erasure.
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (/session-token(?:\.\d+)?$/.test(cookie.name)) {
      cookieStore.delete(cookie.name);
    }
  }
  return { success: true };
}

"use server";

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
  return { success: true };
}

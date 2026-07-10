"use server";

import { signOut } from "@/lib/auth";

/** Server-side sign-out (e.g. from a Server Action form). Prefer client `signOut` in the header for speed. */
export async function logoutUser() {
  await signOut({ redirectTo: "/" });
}

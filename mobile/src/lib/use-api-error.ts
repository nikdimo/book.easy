import { useCallback } from "react";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { ApiError } from "@/lib/api";

/** Turns a thrown request failure into the message a screen should show, and handles
 *  the one case that is not a message at all.
 *
 *  A 401 means the session is gone. Printing "Authentication required" in the error
 *  slot leaves the host staring at a dead screen with no way forward; clearing the
 *  session instead lets the routing layouts move them to sign-in. Those screens
 *  return `null` so the caller renders nothing while the redirect happens.
 *
 *  A 403 is deliberately *not* treated this way — the host is signed in and signing
 *  in again would change nothing, so they get told what happened. */
export function useApiError() {
  const { clearSession } = useAuth();
  const { t } = useLanguage();

  return useCallback(
    (caught: unknown, fallback = "Something went wrong. Please try again."): string | null => {
      if (caught instanceof ApiError) {
        if (caught.isUnauthenticated) {
          clearSession();
          return null;
        }
        return caught.message;
      }
      return caught instanceof Error ? caught.message : t(fallback);
    },
    [clearSession, t]
  );
}

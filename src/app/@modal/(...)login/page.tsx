import { Suspense } from "react";
import { LoginModal } from "@/components/auth/login-modal";

/** Intercepts client-side navigation to /login (e.g. clicking "Log in" in the header)
 * and renders it as an overlay on top of whatever page triggered it, instead of
 * navigating away — see src/app/(auth)/login/page.tsx for the plain full-page version
 * used on direct visits / hard refreshes, where there's no "current page" to overlay. */
export default function InterceptedLoginPage() {
  return (
    <Suspense>
      <LoginModal />
    </Suspense>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/auth/login-form";

/** Rendered only via the intercepted /login route — a true overlay on top of whatever
 * page the user was already on (dimmed, not replaced), closed with Escape, a backdrop
 * click, or the form's own close button — all of which go back to that page instead of
 * navigating to "/". */
export function LoginModal() {
  const router = useRouter();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") router.back();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50"
        onClick={() => router.back()}
      />
      <div className="relative w-full max-w-[420px]">
        <AuthForm
          heading="Log in or sign up"
          description="Book unique stays across North Macedonia"
          onClose={() => router.back()}
        />
      </div>
    </div>
  );
}

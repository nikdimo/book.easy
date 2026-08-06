import { Suspense } from "react";
import { Header } from "@/components/shared/header";
import { RegionalSettingsLauncher } from "@/components/shared/regional-settings-launcher";

/** Used only for direct/hard-navigation visits to /login (email links, typed URLs,
 * refreshes) — the common case (clicking "Log in" while browsing) is intercepted into
 * a popup instead (see src/app/@modal/(...)login and login-modal.tsx) so it never
 * navigates away from the page the user was on. Same card as the popup, just centered
 * over a plain banner since there's no underlying page to show behind it here. */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-zoom-90 min-h-screen flex flex-col bg-background">
      {/* The launcher degrades on its own when the database is down — authentication
          must stay available through a temporary outage. */}
      <Suspense fallback={<div className="h-20 border-b bg-background" />}>
        <Header regionalSettings={<RegionalSettingsLauncher />} />
      </Suspense>

      <div className="relative flex-1 flex items-center justify-center overflow-hidden px-4 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-32 h-80 w-80 rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-secondary/15 blur-3xl"
        />

        <div className="relative w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  );
}

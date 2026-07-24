import { Suspense } from "react";
import { Header } from "@/components/shared/header";
import { BrandLogo } from "@/components/shared/brand-logo";

/** Used only for direct/hard-navigation visits to /login (email links, typed URLs,
 * refreshes) — the common case (clicking "Log in" while browsing) is intercepted into
 * a popup instead (see src/app/@modal/(...)login and login-modal.tsx) so it never
 * navigates away from the page the user was on.
 *
 * A static two-panel layout rather than a bare centered card: a lone form floating in
 * a big empty page looks sparse on wide screens, and this doesn't depend on there being
 * enough listing photos to fill a backdrop. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Suspense fallback={<div className="h-20 border-b bg-background" />}>
        <Header />
      </Suspense>

      <div className="flex-1 grid md:grid-cols-2">
        <div className="hidden md:flex flex-col justify-center gap-6 p-12 lg:p-16 bg-gradient-to-br from-primary/10 via-secondary/10 to-primary/5">
          <BrandLogo className="h-14 w-auto" />
          <div className="max-w-sm space-y-2">
            <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
              Book unique stays across North Macedonia
            </h2>
            <p className="text-muted-foreground">
              Lakeside villas, mountain cabins, and city apartments — all in one place.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center px-4 py-12 sm:p-12">
          <div className="w-full max-w-[420px]">{children}</div>
        </div>
      </div>
    </div>
  );
}

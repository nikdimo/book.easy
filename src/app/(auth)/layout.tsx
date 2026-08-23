import Image from "next/image";
import { Suspense } from "react";
import { Header } from "@/components/shared/header";
import { RegionalSettingsLauncher } from "@/components/shared/regional-settings-launcher";

/** Used only for direct/hard-navigation visits to /login (email links, typed URLs,
 * refreshes) — the common case (clicking "Log in" while browsing) is intercepted into
 * a popup instead (see src/app/@modal/(...)login and login-modal.tsx) so it never
 * navigates away from the page the user was on. Same card as the popup; here it floats
 * over a full-bleed image because there is no underlying page to show behind it. */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-zoom-90 flex min-h-screen flex-col bg-background">
      {/* The launcher degrades on its own when the database is down — authentication
          must stay available through a temporary outage. */}
      <Suspense fallback={<div className="h-20 border-b bg-background" />}>
        <Header regionalSettings={<RegionalSettingsLauncher />} />
      </Suspense>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10 sm:py-14">
        {/* Our own photography, not a decorative blur: the card is the only thing on
            the screen, and a flat panel behind it makes the page read as an error
            state. `priority` because it is the largest paint on a page whose whole
            job is to load fast and let someone in. */}
        <Image
          src="/images/owner-hero-apartment.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="pointer-events-none select-none object-cover"
        />
        {/* Enough scrim to keep the card's edge readable against a bright photo
            without turning the image into grey. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-slate-950/25" />

        <div className="relative w-full max-w-[36rem]">{children}</div>
      </div>
    </div>
  );
}

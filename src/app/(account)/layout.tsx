import { Suspense } from "react";
import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";
import { RegionalSettingsLauncher } from "@/components/shared/regional-settings-launcher";
import { requireUserPage } from "@/lib/auth-helpers";
import { MobileBottomNav } from "@/components/shared/mobile-bottom-nav";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth: middleware already gates `/account/:path*`.
  await requireUserPage();

  return (
    <div className="app-zoom-90 flex min-h-screen flex-col">
      <Suspense fallback={<div className="h-[72px] border-b bg-background" />}>
        <Header regionalSettings={<RegionalSettingsLauncher />} />
      </Suspense>
      <main className="flex-1 container mx-auto px-4 py-8 max-lg:pb-[calc(var(--mobile-nav-height)+2rem)]">{children}</main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}

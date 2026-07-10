import { Suspense } from "react";
import { Header } from "@/components/shared/header";
import { Footer } from "@/components/shared/footer";
import { requireUserPage } from "@/lib/auth-helpers";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth: middleware already gates `/account/:path*`.
  await requireUserPage();

  return (
    <>
      <Suspense fallback={<div className="h-[72px] border-b bg-background" />}>
        <Header />
      </Suspense>
      <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
      <Footer />
    </>
  );
}

import { Suspense } from "react";
import { HostSidebar } from "@/components/host/host-sidebar";

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <Suspense fallback={<div className="hidden md:block w-56 shrink-0 border-r bg-muted animate-pulse" />}>
        <HostSidebar />
      </Suspense>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

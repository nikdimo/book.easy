import { HostSidebar } from "@/components/host/host-sidebar";
import { requireHostPage } from "@/lib/auth-helpers";

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth: middleware already gates `/host/:path*`, but every host page's
  // data queries should not run on the strength of the middleware matcher alone.
  await requireHostPage();

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <HostSidebar />
      <main className="flex-1 min-w-0 min-h-0">{children}</main>
    </div>
  );
}

import { HostSidebar } from "@/components/host/host-sidebar";
import { requireHostPage } from "@/lib/auth-helpers";
import { getEnabledLanguages } from "@/lib/services/language.service";

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth: middleware already gates `/host/:path*`, but every host page's
  // data queries should not run on the strength of the middleware matcher alone.
  await requireHostPage();
  const languages = await getEnabledLanguages();

  return (
    <div className="app-zoom-90 flex h-dvh min-h-0 flex-col overflow-hidden bg-background xl:flex-row">
      <HostSidebar languages={languages} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="host-main min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

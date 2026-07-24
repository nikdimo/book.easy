import { HostSidebar } from "@/components/host/host-sidebar";
import { GoogleTranslateWidget } from "@/components/shared/google-translate-widget";
import { requireHostPage } from "@/lib/auth-helpers";
import { getEnabledLanguages } from "@/lib/services/language.service";

export default async function HostLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth: middleware already gates `/host/:path*`, but every host page's
  // data queries should not run on the strength of the middleware matcher alone.
  await requireHostPage();
  const languages = await getEnabledLanguages();

  return (
    <div className="flex min-h-screen flex-col bg-background md:h-screen md:flex-row md:overflow-hidden">
      <HostSidebar languages={languages} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col md:h-screen md:min-h-0">
        <div className="hidden md:flex items-center justify-end border-b bg-background px-8 py-4">
          <GoogleTranslateWidget languages={languages} />
        </div>
        <main className="host-main min-h-0 min-w-0 flex-1 md:overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

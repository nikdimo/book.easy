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
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <HostSidebar languages={languages} />
      <div className="flex min-h-screen flex-1 min-w-0 flex-col">
        <div className="hidden md:flex items-center justify-end border-b bg-background px-8 py-4">
          <GoogleTranslateWidget languages={languages} />
        </div>
        <main className="flex-1 min-w-0 min-h-0">{children}</main>
      </div>
    </div>
  );
}

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { GoogleTranslateWidget } from "@/components/shared/google-translate-widget";
import { requireAdminPage } from "@/lib/auth-helpers";
import { getEnabledLanguages } from "@/lib/services/language.service";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: middleware already gates `/admin/:path*`, but every admin page's
  // data queries should not run on the strength of the middleware matcher alone.
  await requireAdminPage();
  const languages = await getEnabledLanguages();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AdminSidebar languages={languages} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="hidden items-center justify-end border-b bg-background px-8 py-4 md:flex">
          <GoogleTranslateWidget languages={languages} />
        </div>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

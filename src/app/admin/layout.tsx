import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { GoogleTranslateWidget } from "@/components/shared/google-translate-widget";
import { requireAdminPage } from "@/lib/auth-helpers";
import { getEnabledLanguages } from "@/lib/services/language.service";
import { getPendingSuggestionCount } from "@/lib/services/admin.service";
import {
  getPendingCaseCount,
  getUnreadReviewCount,
} from "@/lib/services/review.service";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: middleware already gates `/admin/:path*`, but every admin page's
  // data queries should not run on the strength of the middleware matcher alone.
  const admin = await requireAdminPage();
  const [languages, pendingSuggestionCount, unreadReviewCount, pendingCaseCount] =
    await Promise.all([
    getEnabledLanguages(),
    getPendingSuggestionCount(),
    getUnreadReviewCount(admin.id),
    getPendingCaseCount(),
  ]);

  return (
    <div className="app-zoom-80 flex min-h-screen flex-col md:flex-row">
      <AdminSidebar
        languages={languages}
        pendingSuggestionCount={pendingSuggestionCount}
        unreadReviewCount={unreadReviewCount}
        pendingCaseCount={pendingCaseCount}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <div className="hidden items-center justify-end border-b bg-background px-8 py-4 md:flex">
          <GoogleTranslateWidget languages={languages} />
        </div>
        <main className="min-w-0 flex-1 bg-background p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

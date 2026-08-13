"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  FileText,
  Flag,
  Home,
  LayoutDashboard,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  MessagesSquare,
  Megaphone,
  ShieldAlert,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { GoogleTranslateWidget } from "@/components/shared/google-translate-widget";
import { Tx, translatedClass, useI18n } from "@/lib/i18n/client";
import type { getEnabledLanguages } from "@/lib/services/language.service";

const adminNav = [
  { href: "/admin", id: "dashboard", icon: LayoutDashboard },
  { href: "/admin/listings", id: "listings", icon: Home },
  { href: "/admin/reports", id: "reports", icon: Flag },
  { href: "/admin/ratings", id: "ratings", icon: Star },
  { href: "/admin/cases", id: "cases", icon: ShieldAlert },
  { href: "/admin/communications", id: "communications", icon: MessagesSquare },
  { href: "/admin/bookings", id: "bookings", icon: CalendarDays },
  { href: "/admin/users", id: "users", icon: Users },
  { href: "/admin/marketing", id: "marketing", icon: Megaphone },
  { href: "/admin/audit-log", id: "audit_log", icon: FileText },
  { href: "/admin/settings", id: "settings", icon: Settings },
] as const;

function adminNavigationLabel(
  resolve: ReturnType<typeof useI18n>["resolve"],
  id: (typeof adminNav)[number]["id"],
) {
  switch (id) {
    case "dashboard": return resolve("admin.sidebar.dashboard", "Dashboard");
    case "listings": return resolve("admin.sidebar.listings", "Listings");
    case "reports": return resolve("admin.sidebar.reports", "Listing reports");
    case "ratings": return resolve("admin.sidebar.ratings", "Ratings & reviews");
    case "cases": return resolve("admin.sidebar.cases", "Cases");
    case "communications": return resolve("admin.sidebar.communications", "Communications");
    case "bookings": return resolve("admin.sidebar.bookings", "Bookings");
    case "users": return resolve("admin.sidebar.users", "Users");
    case "marketing": return resolve("admin.sidebar.marketing", "Marketing consent");
    case "audit_log": return resolve("admin.sidebar.audit_log", "Audit log");
    case "settings": return resolve("admin.sidebar.settings", "Settings");
  }
}

type Languages = Awaited<ReturnType<typeof getEnabledLanguages>>;

function AdminNavigation({
  onNavigate,
  pendingSuggestionCount,
  unreadReviewCount,
  pendingCaseCount,
}: {
  onNavigate?: () => void;
  pendingSuggestionCount: number;
  unreadReviewCount: number;
  pendingCaseCount: number;
}) {
  const { resolve } = useI18n();
  return (
    <div className="flex h-full flex-col">
      <Link href="/admin" onClick={onNavigate} className="mb-6 flex items-center gap-2 px-3 py-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <Tx k="admin.sidebar.panel" source="Admin Panel" />
      </Link>
      <nav className="space-y-1">
        {adminNav.map((item) => {
          const label = adminNavigationLabel(resolve, item.id);
          return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <item.icon className="h-4 w-4" />
            <span className={translatedClass(label)}>{label.text}</span>
            {item.href === "/admin/settings" && pendingSuggestionCount > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {pendingSuggestionCount}
              </span>
            )}
            {item.href === "/admin/ratings" && unreadReviewCount > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {unreadReviewCount}
              </span>
            )}
            {item.href === "/admin/cases" && pendingCaseCount > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-medium text-white">
                {pendingCaseCount}
              </span>
            )}
          </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t pt-4">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
          <Tx k="admin.sidebar.back_to_site" source="Back to site" />
        </Link>
      </div>
    </div>
  );
}

export function AdminSidebar({
  languages,
  pendingSuggestionCount = 0,
  unreadReviewCount = 0,
  pendingCaseCount = 0,
}: {
  languages: Languages;
  pendingSuggestionCount?: number;
  unreadReviewCount?: number;
  pendingCaseCount?: number;
}) {
  const { resolve } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={resolve("admin.sidebar.open_menu", "Open admin menu").text}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetHeader className="sr-only">
                <SheetTitle><Tx k="admin.sidebar.menu" source="Admin menu" /></SheetTitle>
              </SheetHeader>
              <AdminNavigation
                onNavigate={() => setOpen(false)}
                pendingSuggestionCount={pendingSuggestionCount}
                unreadReviewCount={unreadReviewCount}
                pendingCaseCount={pendingCaseCount}
              />
            </SheetContent>
          </Sheet>
          <span className="truncate font-semibold"><Tx k="admin.sidebar.panel" source="Admin Panel" /></span>
        </div>
        <GoogleTranslateWidget languages={languages} />
      </header>
      <aside className="hidden min-h-screen w-60 shrink-0 border-r bg-muted/30 p-4 md:block">
        <AdminNavigation
          pendingSuggestionCount={pendingSuggestionCount}
          unreadReviewCount={unreadReviewCount}
          pendingCaseCount={pendingCaseCount}
        />
      </aside>
    </>
  );
}

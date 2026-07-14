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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { GoogleTranslateWidget } from "@/components/shared/google-translate-widget";
import type { getEnabledLanguages } from "@/lib/services/language.service";

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/listings", label: "Listings", icon: Home },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/bookings", label: "Bookings", icon: CalendarDays },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/audit-log", label: "Audit Log", icon: FileText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

type Languages = Awaited<ReturnType<typeof getEnabledLanguages>>;

function AdminNavigation({
  onNavigate,
  pendingSuggestionCount,
}: {
  onNavigate?: () => void;
  pendingSuggestionCount: number;
}) {
  return (
    <div className="flex h-full flex-col">
      <Link href="/admin" onClick={onNavigate} className="mb-6 flex items-center gap-2 px-3 py-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <span className="font-bold">Admin Panel</span>
      </Link>
      <nav className="space-y-1">
        {adminNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.href === "/admin/settings" && pendingSuggestionCount > 0 && (
              <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
                {pendingSuggestionCount}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="mt-auto border-t pt-4">
        <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
          Back to site
        </Link>
      </div>
    </div>
  );
}

export function AdminSidebar({
  languages,
  pendingSuggestionCount = 0,
}: {
  languages: Languages;
  pendingSuggestionCount?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Open admin menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetHeader className="sr-only"><SheetTitle>Admin menu</SheetTitle></SheetHeader>
              <AdminNavigation
                onNavigate={() => setOpen(false)}
                pendingSuggestionCount={pendingSuggestionCount}
              />
            </SheetContent>
          </Sheet>
          <span className="truncate font-semibold">Admin Panel</span>
        </div>
        <GoogleTranslateWidget languages={languages} />
      </header>
      <aside className="hidden min-h-screen w-60 shrink-0 border-r bg-muted/30 p-4 md:block">
        <AdminNavigation pendingSuggestionCount={pendingSuggestionCount} />
      </aside>
    </>
  );
}

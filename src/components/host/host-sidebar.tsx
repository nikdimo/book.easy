"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Menu,
  User,
  Home,
  House,
  LogOut,
  LayoutDashboard,
  CalendarDays,
  ShieldCheck,
  Search,
  GripVertical,
  Smartphone,
  MessageCircle,
  Bell,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { nextHeaderHidden } from "@/lib/host/header-collapse";
import { SITE_DOMAIN } from "@/lib/branding";
import { BrandLogo } from "@/components/shared/brand-logo";
import { GoogleTranslateWidget } from "@/components/shared/google-translate-widget";
import { HOST_HEADER_ACTIONS_ID } from "@/components/host/host-header-portal";
import { Tx, translatedClass, useI18n } from "@/lib/i18n/client";
import type { getEnabledLanguages } from "@/lib/services/language.service";
import {
  CountBadge,
  useAttentionSummary,
} from "@/components/communication/attention-indicator";

const hostNav = [
  { href: "/host", id: "dashboard", icon: LayoutDashboard },
  { href: "/host/listings", id: "listings", icon: Home },
  { href: "/host/bookings", id: "bookings", icon: CalendarDays },
  { href: "/host/inbox", id: "inbox", icon: MessageCircle },
  { href: "/account/notifications", id: "notifications", icon: Bell },
  { href: "/host/mobile", id: "mobile_preview", icon: Smartphone },
] as const;

function hostNavigationLabel(
  resolve: ReturnType<typeof useI18n>["resolve"],
  id: (typeof hostNav)[number]["id"],
) {
  switch (id) {
    case "dashboard":
      return resolve("host.sidebar.dashboard", "Dashboard");
    case "listings":
      return resolve("host.sidebar.my_listings", "My Listings");
    case "bookings":
      return resolve("host.sidebar.bookings", "Bookings");
    case "inbox":
      return resolve("host.sidebar.inbox", "Inbox");
    case "notifications":
      return resolve("host.sidebar.notifications", "Notifications");
    case "mobile_preview":
      return resolve("host.sidebar.mobile_preview", "Mobile Preview");
  }
}

function SidebarNavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const { summary } = useAttentionSummary();
  const { resolve } = useI18n();

  return (
    <nav className={cn("space-y-1", className)}>
      {hostNav.map((item) => {
        const label = hostNavigationLabel(resolve, item.id);
        const active =
          item.href === "/host"
            ? pathname === "/host" || pathname === "/host/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const count =
          item.href === "/host"
            ? summary?.host?.total
            : item.href === "/host/bookings"
              ? summary?.host?.pendingBookings
              : item.href === "/host/inbox"
                ? summary?.host?.unreadThreads
                : item.href === "/account/notifications"
                  ? summary?.unreadNotifications
                  : undefined;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
              active
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className={translatedClass(label)}>{label.text}</span>
            <CountBadge
              value={count}
              label={`${label.text.toLowerCase()} items needing attention`}
              className="ml-auto"
            />
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent({
  onNavigate,
  languages,
}: {
  onNavigate?: () => void;
  languages?: Awaited<ReturnType<typeof getEnabledLanguages>>;
}) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const user = session?.user;
  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function handleLogout() {
    await signOut({ redirect: false });
    await update();
    router.replace("/");
    onNavigate?.();
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <Link
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-2 px-1 py-2 mb-4 shrink-0"
        title={SITE_DOMAIN}
      >
        <BrandLogo className="h-12 max-w-full" />
      </Link>

      <SidebarNavLinks onNavigate={onNavigate} />

      <div className="mt-6 pt-6 border-t border-border space-y-1">
        <p className="px-3 text-sm md:text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          <Tx k="host.sidebar.guest" source="Guest" />
        </p>
        <Link
          href="/properties"
          onClick={onNavigate}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Search className="h-4 w-4 shrink-0" />
          <Tx k="host.sidebar.stays" source="Stays" />
        </Link>
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <House className="h-4 w-4 shrink-0" />
          <Tx k="host.sidebar.home" source="Home" />
        </Link>
      </div>

      <div className="mt-auto pt-6 border-t border-border space-y-2">
        {languages && (
          <div className="flex items-center justify-between rounded-lg px-1 py-1">
            <span className="px-2 text-sm md:text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <Tx k="host.sidebar.language" source="Language" />
            </span>
            <GoogleTranslateWidget languages={languages} />
          </div>
        )}
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 h-auto py-2 px-3 rounded-lg border-border"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-sm md:text-xs bg-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-left text-sm font-medium">{user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-sm md:text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/host" onClick={onNavigate}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  <Tx k="host.sidebar.new_panel" source="New host panel" />
                  <span className="ml-auto rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#a94420]">
                    <Tx k="host.sidebar.preview" source="Preview" />
                  </span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account/bookings" onClick={onNavigate}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  <Tx k="host.sidebar.trips" source="Trips" />
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account/profile" onClick={onNavigate}>
                  <User className="mr-2 h-4 w-4" />
                  <Tx k="host.sidebar.account" source="Account" />
                </Link>
              </DropdownMenuItem>
              {user.role === "ADMIN" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/admin" onClick={onNavigate}>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      <Tx k="host.sidebar.admin" source="Admin" />
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer"
                onSelect={(e) => {
                  e.preventDefault();
                  void handleLogout();
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                <Tx k="host.sidebar.log_out" source="Log out" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex flex-col gap-2">
            <Button size="sm" asChild>
              <Link href="/login" onClick={onNavigate}>
                <Tx k="host.sidebar.log_in" source="Log in" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function HostSidebar({
  languages = [],
}: {
  languages?: Awaited<ReturnType<typeof getEnabledLanguages>>;
}) {
  const { resolve } = useI18n();
  const pathname = usePathname();
  // The listing wizard hands this bar its step indicator, which needs the width
  // more than the wordmark does — the symbol alone still says whose site this is.
  const compactBrand = pathname === "/host/listings/new";
  const [open, setOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(232);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [headerHidden, setHeaderHidden] = useState(false);
  // Mirrors headerHidden so the scroll listener can read the current value without
  // re-subscribing on every toggle.
  const headerHiddenRef = useRef(false);

  // The mobile bar is a flex sibling of the scroll area, not a sticky overlay, so it
  // permanently costs ~64px of an already short screen. Give it back while the host
  // is reading downwards and return it the moment they scroll up, so the menu is
  // always one gesture away rather than a scroll-to-top hunt.
  useEffect(() => {
    const lastTop = new WeakMap<EventTarget, number>();
    let lockedUntil = 0;

    function apply(next: boolean) {
      if (headerHiddenRef.current === next) return;
      headerHiddenRef.current = next;
      // Toggling resizes the scroll area, and the browser answers by clamping
      // scrollTop — which arrives here as a scroll event in the opposite direction.
      // Ignore events until the transition has settled so that echo cannot flip the
      // header straight back.
      lockedUntil = performance.now() + 350;
      setHeaderHidden(next);
    }

    function onScroll(event: Event) {
      const target = event.target;
      if (!target) return;
      const element = target instanceof HTMLElement ? target : null;
      const isDocument = target instanceof Document;
      const top = isDocument ? window.scrollY : (element?.scrollTop ?? 0);
      const previous = lastTop.get(target) ?? 0;
      lastTop.set(target, top);

      const active = document.activeElement;
      const next = nextHeaderHidden({
        top,
        previous,
        viewport: isDocument
          ? window.innerHeight
          : (element?.clientHeight ?? 0),
        total: isDocument
          ? document.documentElement.scrollHeight
          : (element?.scrollHeight ?? 0),
        editing:
          active instanceof HTMLElement &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.isContentEditable),
        locked: performance.now() < lockedUntil,
      });
      if (next !== null) apply(next);
    }

    // Capture: the scrolling element is whichever pane is active, not the document.
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("bookeasy:host-sidebar-width");
    const parsed = stored ? Number(stored) : 232;
    const timeout = window.setTimeout(() => {
      if (Number.isFinite(parsed)) setSidebarWidth(Math.min(320, Math.max(208, parsed)));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function updateSidebarWidth(next: number) {
    const width = Math.min(320, Math.max(208, next));
    setSidebarWidth(width);
    window.localStorage.setItem("bookeasy:host-sidebar-width", String(width));
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = { startX: event.clientX, startWidth: sidebarWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function resize(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    updateSidebarWidth(dragRef.current.startWidth + event.clientX - dragRef.current.startX);
  }

  return (
    <>
      <div
        className={cn(
          "z-40 flex shrink-0 items-center justify-between gap-3 overflow-hidden border-b bg-background/95 px-4 backdrop-blur transition-[max-height,padding,opacity] duration-200 xl:hidden",
          headerHidden
            ? "max-h-0 py-0 opacity-0"
            : "max-h-20 py-3 opacity-100",
        )}
      >
        <div className="flex shrink-0 items-center gap-3 min-w-0">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={resolve("host.sidebar.open_menu", "Open menu").text}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 p-0 flex flex-col overflow-hidden"
            >
              <SheetHeader className="sr-only">
                <SheetTitle>
                  <Tx k="host.sidebar.menu_title" source="Hosting menu" />
                </SheetTitle>
              </SheetHeader>
              <div className="overflow-y-auto flex-1 min-h-0 p-4">
                <SidebarContent onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <Link href="/" className="flex items-center gap-1 min-w-0">
            <BrandLogo
              compact={compactBrand}
              className={compactBrand ? "h-9 w-auto" : "h-10 max-w-36"}
            />
          </Link>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {/* Pages hand their own top-bar controls (back, help) to this slot. It
              grows so a page can centre something in it; icon-only consumers stay
              right-aligned by keeping their own wrapper narrow. */}
          <div
            id={HOST_HEADER_ACTIONS_ID}
            className="flex min-w-0 flex-1 items-center justify-end gap-1"
          />
          <GoogleTranslateWidget languages={languages} />
        </div>
      </div>

      <div
        className="relative hidden h-full shrink-0 border-r bg-background xl:flex"
        style={{ width: sidebarWidth }}
      >
        <aside className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto p-4">
          <SidebarContent languages={languages} />
        </aside>
        <div
          role="separator"
          aria-label={
            resolve("host.sidebar.resize_label", "Resize profile navigation").text
          }
          aria-orientation="vertical"
          aria-valuemin={208}
          aria-valuemax={320}
          aria-valuenow={Math.round(sidebarWidth)}
          tabIndex={0}
          onPointerDown={startResize}
          onPointerMove={resize}
          onPointerUp={(event) => {
            dragRef.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onDoubleClick={() => updateSidebarWidth(232)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              updateSidebarWidth(sidebarWidth - 12);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              updateSidebarWidth(sidebarWidth + 12);
            } else if (event.key === "Home") {
              event.preventDefault();
              updateSidebarWidth(232);
            }
          }}
          className="group absolute inset-y-0 -right-1.5 z-30 flex w-3 touch-none cursor-col-resize items-center justify-center outline-none"
        >
          <span className="h-full w-px bg-border transition-colors group-hover:bg-primary group-focus-visible:w-0.5 group-focus-visible:bg-primary" />
          <span className="absolute flex h-10 w-3 items-center justify-center rounded-full border bg-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <GripVertical className="h-3 w-3 text-muted-foreground" />
          </span>
        </div>
      </div>
    </>
  );
}

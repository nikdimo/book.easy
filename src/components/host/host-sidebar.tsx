"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  Building2,
  CalendarDays,
  ShieldCheck,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PRODUCT_FAMILY, PRODUCT_NAME, SITE_DOMAIN } from "@/lib/branding";

const hostNav = [
  { href: "/host", label: "Dashboard", icon: LayoutDashboard },
  { href: "/host/listings", label: "My Listings", icon: Home },
  { href: "/host/bookings", label: "Bookings", icon: CalendarDays },
];

function SidebarNavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("space-y-1", className)}>
      {hostNav.map((item) => {
        const active =
          item.href === "/host"
            ? pathname === "/host" || pathname === "/host/"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
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
        <Building2 className="h-8 w-8 text-primary shrink-0" />
        <span className="text-lg font-semibold tracking-tight text-foreground truncate">
          {PRODUCT_NAME}
          <span className="text-muted-foreground font-normal">.{PRODUCT_FAMILY}</span>
        </span>
      </Link>

      <SidebarNavLinks onNavigate={onNavigate} />

      <div className="mt-6 pt-6 border-t border-border space-y-1">
        <p className="px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Guest
        </p>
        <Link
          href="/properties"
          onClick={onNavigate}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Search className="h-4 w-4 shrink-0" />
          Stays
        </Link>
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-2 px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <House className="h-4 w-4 shrink-0" />
          Home
        </Link>
      </div>

      <div className="mt-auto pt-6 border-t border-border space-y-2">
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-start gap-2 h-auto py-2 px-3 rounded-lg border-border"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-left text-sm font-medium">{user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/account/bookings" onClick={onNavigate}>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  Trips
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/account/profile" onClick={onNavigate}>
                  <User className="mr-2 h-4 w-4" />
                  Account
                </Link>
              </DropdownMenuItem>
              {user.role === "ADMIN" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/admin" onClick={onNavigate}>
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Admin
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
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/login" onClick={onNavigate}>
                Log in
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register" onClick={onNavigate}>
                Sign up
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export function HostSidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 border-b bg-background/95 backdrop-blur px-4 py-3">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-4 flex flex-col">
            <SheetHeader className="sr-only">
              <SheetTitle>Hosting menu</SheetTitle>
            </SheetHeader>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <Link href="/" className="flex items-center gap-1 min-w-0">
          <Building2 className="h-7 w-7 text-primary shrink-0" />
          <span className="font-semibold truncate text-sm">
            {PRODUCT_NAME}
            <span className="text-muted-foreground font-normal">.{PRODUCT_FAMILY}</span>
          </span>
        </Link>
    </div>

      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r bg-background min-h-[calc(100vh-0px)] sticky top-0 self-start p-4">
        <SidebarContent />
      </aside>
    </>
  );
}

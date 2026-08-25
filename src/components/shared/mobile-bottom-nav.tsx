"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Heart,
  MessageCircle,
  Search,
  UserRound,
} from "lucide-react";
import { Tx } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type MobileBottomNavProps = {
  visible?: boolean;
  position?: "fixed" | "absolute";
  className?: string;
};

const items = [
  {
    href: "/properties",
    match: (pathname: string) => pathname === "/" || pathname.startsWith("/properties"),
    icon: Search,
    key: "mobile_nav.explore",
    label: "Explore",
  },
  {
    href: "/account/favorites",
    match: (pathname: string) => pathname.startsWith("/account/favorites"),
    icon: Heart,
    key: "mobile_nav.wishlists",
    label: "Wishlists",
  },
  {
    href: "/account/bookings",
    match: (pathname: string) => pathname.startsWith("/account/bookings"),
    icon: CalendarDays,
    key: "mobile_nav.trips",
    label: "Trips",
  },
  {
    href: "/account/messages",
    match: (pathname: string) => pathname.startsWith("/account/messages"),
    icon: MessageCircle,
    key: "nav.messages",
    label: "Messages",
  },
  {
    href: "/account/profile",
    match: (pathname: string) => pathname.startsWith("/account/profile"),
    icon: UserRound,
    key: "mobile_nav.profile",
    label: "Profile",
  },
] as const;

/** Airbnb-style primary navigation for the phone marketplace shell. */
export function MobileBottomNav({
  visible = true,
  position = "fixed",
  className,
}: MobileBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Mobile navigation"
      aria-hidden={!visible}
      className={cn(
        "inset-x-0 bottom-0 z-50 hidden min-h-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom))] border-t border-border/70 bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-[transform,opacity] duration-300 ease-out max-lg:flex",
        position === "fixed" ? "fixed" : "absolute",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-[calc(100%+1px)] opacity-0",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            tabIndex={visible ? undefined : -1}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 pt-2 text-[0.68rem] font-medium leading-none transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon
              className={cn("size-[1.45rem]", active && "stroke-[2.35]")}
              aria-hidden="true"
            />
            <span className="max-w-full truncate">
              <Tx k={item.key} source={item.label} />
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, CalendarDays, Percent } from "lucide-react";
import { cn } from "@/lib/utils";

export function ListingManagementTabs({ listingId }: { listingId: string }) {
  const pathname = usePathname();
  const tabs = [
    {
      label: "Availability",
      href: `/host/listings/${listingId}/availability`,
      icon: CalendarDays,
    },
    {
      label: "Pricing",
      href: `/host/listings/${listingId}/pricing`,
      icon: Banknote,
    },
    {
      label: "Discounts",
      href: `/host/listings/${listingId}/promotion`,
      icon: Percent,
    },
  ];

  return (
    <nav
      aria-label="Availability, pricing and promotion sections"
      className="touch-pan-x overflow-x-auto overflow-y-hidden border-b [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-12 items-center gap-2 rounded-t-lg border border-b-0 px-4 py-3 text-sm font-semibold transition-colors",
                active
                  ? "border-border bg-background text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-background"
                  : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

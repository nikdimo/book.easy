"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Banknote, CalendarDays, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

export function ListingManagementTabs({
  listingId,
  /** Carries the selected date range between lenses — see CalendarWorkspace. */
  preserveQuery = "",
}: {
  listingId: string;
  preserveQuery?: string;
}) {
  const pathname = usePathname();
  const { resolve } = useI18n();
  const base = `/host/listings/${listingId}`;
  const tabs = [
    {
      label: resolve("host.workspace.availability", "Availability"),
      path: `${base}/availability`,
      icon: CalendarDays,
    },
    {
      label: resolve("host.workspace.pricing", "Pricing"),
      path: `${base}/pricing`,
      icon: Banknote,
    },
    {
      label: resolve("host.tabs.promotions", "Promotions"),
      path: `${base}/promotion`,
      icon: Percent,
    },
  ];

  return (
    <nav
      aria-label={
        resolve(
          "host.tabs.nav_label",
          "Availability, pricing and promotion sections",
        ).text
      }
      // Tapping a tab must not count as clicking away from the calendar, or the
      // selection would be cleared on the way out and arrive here empty.
      data-keeps-calendar-selection
      className="touch-pan-x overflow-x-auto overflow-y-hidden border-b [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.path;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              href={`${tab.path}${preserveQuery}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-12 items-center gap-2 rounded-t-lg border border-b-0 px-4 py-3 text-sm font-semibold transition-colors",
                active
                  ? "border-border bg-background text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-background"
                  : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className={tab.label.translated ? "notranslate" : undefined}>
                {tab.label.text}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

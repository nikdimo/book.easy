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
      className="sticky top-0 z-20 touch-pan-x bg-background/95 py-1 backdrop-blur md:static md:bg-transparent md:py-0 md:backdrop-blur-none"
    >
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1 md:flex md:min-w-max md:rounded-none md:bg-transparent md:p-0">
        {tabs.map((tab) => {
          const active = pathname === tab.path;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.path}
              href={`${tab.path}${preserveQuery}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors md:min-h-12 md:justify-start md:gap-2 md:rounded-t-lg md:border md:border-b-0 md:px-4 md:py-3 md:text-sm",
                active
                  ? "bg-background text-foreground shadow-sm md:border-border md:shadow-none md:after:absolute md:after:inset-x-0 md:after:-bottom-px md:after:h-px md:after:bg-background"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground md:border-transparent md:bg-muted/50 md:hover:bg-muted md:hover:text-foreground"
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

"use client";

import Link from "next/link";
import { Banknote, CalendarDays, House, Percent } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  LISTING_PRIMARY_DESTINATIONS,
  listingStopHref,
  withSelectionQuery,
  type ListingPrimaryDestination,
  type ListingWorkspaceStop,
} from "@/lib/host/listing-workspace";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

const DESTINATION_ICONS: Record<ListingPrimaryDestination, LucideIcon> = {
  listing: House,
  availability: CalendarDays,
  pricing: Banknote,
  promotions: Percent,
};

const ITEM_CLASS =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[0.65rem] font-medium transition-colors";

/**
 * The stable mobile navigation for a published listing. These are the same four
 * ownership buckets the creation flow teaches; Preview is a header action.
 */
export function ListingBottomNav({
  listingId,
  active,
  className,
  preserveQuery = "",
  onSelectPane,
  onNavigate,
}: {
  listingId: string;
  active: ListingWorkspaceStop;
  className?: string;
  /** Carries a selected date range when navigating away from a calendar lens. */
  preserveQuery?: string;
  /** Provided by the edit form, where Listing is already the active pane. */
  onSelectPane?: (pane: "edit") => void;
  onNavigate?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}) {
  const { resolve } = useI18n();
  const destinationLabels: Record<ListingPrimaryDestination, string> = {
    listing: resolve("host.workspace.listing", "Listing").text,
    availability: resolve("host.workspace.availability", "Availability").text,
    pricing: resolve("host.workspace.pricing", "Pricing").text,
    promotions: resolve("host.tabs.promotions", "Promotions").text,
  };
  const activeDestination: ListingPrimaryDestination =
    active === "availability" || active === "pricing" || active === "promotions"
      ? active
      : "listing";

  return (
    <nav
      aria-label={resolve("host.workspace.nav_label", "Listing workspace").text}
      className={cn(
        "z-30 flex shrink-0 items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden",
        className,
      )}
    >
      {LISTING_PRIMARY_DESTINATIONS.map(({ destination, stop }) => {
        const label = destinationLabels[destination];
        const Icon = DESTINATION_ICONS[destination];
        const current = activeDestination === destination;
        if (onSelectPane && destination === "listing") {
          return (
            <button
              key={destination}
              type="button"
              aria-current={current ? "page" : undefined}
              aria-controls="listing-editor-pane"
              onClick={() => onSelectPane("edit")}
              className={cn(
                ITEM_CLASS,
                current ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </button>
          );
        }

        return (
          <Link
            key={destination}
            href={withSelectionQuery(
              listingStopHref(listingId, stop),
              preserveQuery,
            )}
            onClick={onNavigate}
            aria-current={current ? "page" : undefined}
            className={cn(
              ITEM_CLASS,
              current ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

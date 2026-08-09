"use client";

import Link from "next/link";
import { CalendarDays, Eye, Pencil } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  LISTING_PRIMARY_DESTINATIONS,
  isCalendarWorkspaceStop,
  listingStopHref,
  withSelectionQuery,
  type ListingPrimaryDestination,
  type ListingWorkspaceStop,
} from "@/lib/host/listing-workspace";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

const DESTINATION_ICONS: Record<ListingPrimaryDestination, LucideIcon> = {
  details: Pencil,
  calendar: CalendarDays,
  preview: Eye,
};

const ITEM_CLASS =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[0.65rem] font-medium transition-colors";

/**
 * The stable mobile navigation for a published listing. Calendar is one primary
 * destination; availability, pricing and promotions are switched inside it.
 */
export function ListingBottomNav({
  listingId,
  active,
  className,
  paneOnly = false,
  preserveQuery = "",
  onSelectPane,
  onNavigate,
}: {
  listingId: string;
  active: ListingWorkspaceStop;
  className?: string;
  /** Carries a selected date range when navigating away from a calendar lens. */
  preserveQuery?: string;
  /** A draft has no id-based calendar route yet, so it shows the panes only. */
  paneOnly?: boolean;
  /** Provided by the edit form, where Details and Preview are panes, not routes. */
  onSelectPane?: (pane: "edit" | "preview") => void;
  onNavigate?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
}) {
  const { resolve } = useI18n();
  const destinationLabels: Record<ListingPrimaryDestination, string> = {
    details: resolve("host.workspace.details", "Details").text,
    calendar: resolve("host.workspace.calendar", "Calendar").text,
    preview: resolve("host.workspace.preview", "Preview").text,
  };
  const activeDestination: ListingPrimaryDestination =
    active === "preview"
      ? "preview"
      : isCalendarWorkspaceStop(active)
        ? "calendar"
        : "details";
  const destinations = paneOnly
    ? LISTING_PRIMARY_DESTINATIONS.filter(
        ({ destination }) => destination !== "calendar",
      )
    : LISTING_PRIMARY_DESTINATIONS;

  return (
    <nav
      aria-label={resolve("host.workspace.nav_label", "Listing workspace").text}
      className={cn(
        "z-30 flex shrink-0 items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden",
        className,
      )}
    >
      {destinations.map(({ destination, stop }) => {
        const label = destinationLabels[destination];
        const Icon = DESTINATION_ICONS[destination];
        const current = activeDestination === destination;
        const pane = destination === "preview" ? "preview" : "edit";

        if (onSelectPane && destination !== "calendar") {
          return (
            <button
              key={destination}
              type="button"
              aria-current={current ? "page" : undefined}
              aria-controls={`listing-${pane === "edit" ? "editor" : "preview"}-pane`}
              onClick={() => onSelectPane(pane)}
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

        const hrefStop =
          destination === "calendar" && isCalendarWorkspaceStop(active)
            ? active
            : stop;
        return (
          <Link
            key={destination}
            href={withSelectionQuery(
              listingStopHref(listingId, hrefStop),
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

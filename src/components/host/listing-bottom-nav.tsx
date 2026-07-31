"use client";

import Link from "next/link";
import { Banknote, CalendarDays, Eye, Pencil, Percent } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  LISTING_WORKSPACE_STOPS,
  listingStopHref,
  type ListingWorkspaceStop,
} from "@/lib/host/listing-workspace";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

const STOP_ICONS: Record<ListingWorkspaceStop, LucideIcon> = {
  preview: Eye,
  edit: Pencil,
  availability: CalendarDays,
  pricing: Banknote,
  promotions: Percent,
};

const ITEM_CLASS =
  "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[0.6rem] font-medium transition-colors";

/**
 * One bar across all five screens. It has to be the same object everywhere or it
 * stops being a place you can navigate from — which is exactly what happened when
 * it only existed inside the edit form.
 *
 * Publish is deliberately absent: it is a commit, not a destination, and a
 * slot-sized target between navigation items invites mis-taps. The edit form
 * renders its own Preview/Publish action row below this bar.
 */
export function ListingBottomNav({
  listingId,
  active,
  className,
  paneOnly = false,
  omitPreview = false,
  onSelectPane,
  onNavigate,
  onKeyDown,
}: {
  listingId: string;
  active: ListingWorkspaceStop;
  className?: string;
  /** A draft has no id-based calendar routes yet, so it shows the panes only. */
  paneOnly?: boolean;
  /** Set where Preview lives in an action row instead, so it isn't offered twice. */
  omitPreview?: boolean;
  /** Provided by the edit form, where Preview and Edit are panes, not routes. */
  onSelectPane?: (pane: "edit" | "preview") => void;
  onNavigate?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  const { resolve } = useI18n();
  const paneStops = LISTING_WORKSPACE_STOPS.slice(0, 2).filter(
    ({ stop }) => !(omitPreview && stop === "preview"),
  );

  // Resolved here with literal key/source pairs because the shared stop constant is
  // consumed by server components too, and the extractor cannot read a variable label.
  const stopLabels: Record<ListingWorkspaceStop, string> = {
    preview: resolve("host.workspace.preview", "Preview").text,
    edit: resolve("host.workspace.edit", "Edit").text,
    availability: resolve("host.workspace.availability", "Availability").text,
    pricing: resolve("host.workspace.pricing", "Pricing").text,
    promotions: resolve("host.workspace.promotions", "Promos").text,
  };

  return (
    <nav
      aria-label={resolve("host.workspace.nav_label", "Listing workspace").text}
      className={cn(
        "z-30 flex shrink-0 items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden",
        className,
      )}
    >
      <div
        role={onSelectPane && !omitPreview ? "tablist" : undefined}
        aria-label={
          onSelectPane && !omitPreview
            ? resolve("host.workspace.tablist_label", "Editor and preview").text
            : undefined
        }
        onKeyDown={omitPreview ? undefined : onKeyDown}
        className={cn("flex", omitPreview ? "flex-1" : "flex-[2]")}
      >
        {paneStops.map(({ stop }) => {
          const label = stopLabels[stop];
          const Icon = STOP_ICONS[stop];
          const pane = stop === "preview" ? "preview" : "edit";
          const current = active === stop;

          if (!onSelectPane) {
            return (
              <Link
                key={stop}
                href={listingStopHref(listingId, stop)}
                onClick={onNavigate}
                aria-current={current ? "page" : undefined}
                className={cn(
                  ITEM_CLASS,
                  current ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          }

          return (
            <button
              key={stop}
              type="button"
              role={omitPreview ? undefined : "tab"}
              aria-selected={omitPreview ? undefined : current}
              aria-current={omitPreview && current ? "page" : undefined}
              tabIndex={omitPreview || current ? 0 : -1}
              aria-controls={`listing-${pane === "edit" ? "editor" : "preview"}-pane`}
              id={`listing-${pane}-tab`}
              onClick={() => onSelectPane(pane)}
              className={cn(
                ITEM_CLASS,
                current ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          );
        })}
      </div>
      {(paneOnly ? [] : LISTING_WORKSPACE_STOPS.slice(2)).map(
        ({ stop }) => {
          const label = stopLabels[stop];
          const Icon = STOP_ICONS[stop];
          const current = active === stop;
          return (
            <Link
              key={stop}
              href={listingStopHref(listingId, stop)}
              onClick={onNavigate}
              aria-current={current ? "page" : undefined}
              className={cn(
                ITEM_CLASS,
                current ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        },
      )}
    </nav>
  );
}

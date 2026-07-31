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
 * Publish is deliberately absent: it is a commit, not a destination, and only the
 * edit form has anything to publish (the calendar screens save on each action). The
 * form renders its own publish strip above this bar when there are unsaved changes.
 */
export function ListingBottomNav({
  listingId,
  active,
  className,
  paneOnly = false,
  onSelectPane,
  onNavigate,
  onKeyDown,
}: {
  listingId: string;
  active: ListingWorkspaceStop;
  className?: string;
  /** A draft has no id-based calendar routes yet, so it shows the panes only. */
  paneOnly?: boolean;
  /** Provided by the edit form, where Preview and Edit are panes, not routes. */
  onSelectPane?: (pane: "edit" | "preview") => void;
  onNavigate?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <nav
      aria-label="Listing workspace"
      className={cn(
        "z-30 flex shrink-0 items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden",
        className,
      )}
    >
      <div
        role={onSelectPane ? "tablist" : undefined}
        aria-label={onSelectPane ? "Editor and preview" : undefined}
        onKeyDown={onKeyDown}
        className="flex flex-[2]"
      >
        {LISTING_WORKSPACE_STOPS.slice(0, 2).map(({ stop, label }) => {
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
              role="tab"
              aria-selected={current}
              tabIndex={current ? 0 : -1}
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
        ({ stop, label }) => {
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

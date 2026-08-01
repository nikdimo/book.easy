"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { LISTING_ACTION_BAR_ID } from "@/lib/host/listing-workspace";

/**
 * The phone action row at the very bottom of the listing workspace, under the nav.
 *
 * The calendar's actions depend on the selected dates, which only the client
 * workspace knows — but the row has to be pinned to the viewport, outside the
 * scrolling card. The page owns the fixed container and the workspace fills it
 * through this slot, the same arrangement as the shell's header actions.
 */
export function ListingActionBarPortal({ children }: { children: ReactNode }) {
  const target = useSyncExternalStore(
    () => () => {},
    () => document.getElementById(LISTING_ACTION_BAR_ID),
    () => null,
  );

  if (!target) return null;
  return createPortal(children, target);
}

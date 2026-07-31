"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const HOST_HEADER_ACTIONS_ID = "host-header-actions";

/**
 * Lets a page put its own controls in the host shell's top bar, beside the language
 * widget. The shell owns that bar, so a page that wants a back button up there cannot
 * simply render one — it hands it over through this slot instead.
 */
export function HostHeaderPortal({ children }: { children: ReactNode }) {
  // The slot is part of the shell's markup, so it is in the DOM as soon as the client
  // renders — only its visibility is a media query. Nothing ever swaps that node out,
  // hence the no-op subscribe; this is just "null on the server, the node after
  // hydration" without a state update in an effect.
  const target = useSyncExternalStore(
    () => () => {},
    () => document.getElementById(HOST_HEADER_ACTIONS_ID),
    () => null,
  );

  if (!target) return null;
  return createPortal(children, target);
}

"use client";

import { useEffect } from "react";

export interface NavigationIntent {
  href: string | null;
  target?: string | null;
  download?: boolean;
}

/** Links that replace the current document or Next.js route can discard an explicit-
 * save edit. In-page anchors, downloads, new tabs and non-navigation URL schemes do
 * not replace this editor and must remain untouched. */
export function shouldGuardNavigation(
  intent: NavigationIntent,
  currentHref: string,
): boolean {
  if (!intent.href || intent.download) return false;
  if (intent.target && intent.target !== "_self") return false;
  if (
    intent.href.startsWith("#") ||
    /^(mailto:|tel:|javascript:)/i.test(intent.href)
  ) {
    return false;
  }

  try {
    const current = new URL(currentHref);
    const destination = new URL(intent.href, current);
    return (
      destination.origin !== current.origin ||
      destination.pathname !== current.pathname ||
      destination.search !== current.search
    );
  } catch {
    return false;
  }
}

/**
 * Protects explicit-save editors from both browser unloads and same-document client
 * navigation. The document capture listener covers navigation outside the editor
 * subtree (for example the global host sidebar), which component-local onClick guards
 * cannot see.
 */
export function useUnsavedNavigationGuard(
  active: boolean,
  message: string,
) {
  useEffect(() => {
    if (!active) return;

    function beforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    function captureLinkNavigation(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;
      if (
        !shouldGuardNavigation(
          {
            href: anchor.getAttribute("href"),
            target: anchor.getAttribute("target"),
            download: anchor.hasAttribute("download"),
          },
          window.location.href,
        )
      ) {
        return;
      }
      if (window.confirm(message)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", captureLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", captureLinkNavigation, true);
    };
  }, [active, message]);
}

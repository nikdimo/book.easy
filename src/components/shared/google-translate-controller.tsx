"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  retranslateAfterNavigation,
  startGoogleTranslateRuntime,
} from "@/lib/i18n/google-translate-runtime";
import {
  applyUserContentTranslationPreference,
  readAutoTranslateUserContentPreference,
} from "@/lib/i18n/user-content-translation";

/**
 * Mounted once in the root layout. It owns Google's script, hidden element, cookie
 * normalization, route-change pass and overlay observer for the whole application;
 * `GoogleTranslateWidget` renders only the selector UI. Keeping this a single instance
 * is what stops one opened popover from triggering a full-document translation pass per
 * mounted selector.
 */
export function GoogleTranslateController({
  locale,
  disabled = false,
}: {
  locale: string;
  /** Fast local UI work uses reviewed catalog strings without loading Google's
   * remote runtime or allowing it to rewrite React's DOM during refreshes. */
  disabled?: boolean;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (disabled) return;
    applyUserContentTranslationPreference();
    const observer = new MutationObserver((records) => {
      if (readAutoTranslateUserContentPreference()) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement) {
            if (node.matches("[data-user-generated-content]")) {
              node.classList.add("notranslate");
              node.setAttribute("translate", "no");
            }
            applyUserContentTranslationPreference(node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const stopRuntime = startGoogleTranslateRuntime(locale);
    return () => {
      observer.disconnect();
      stopRuntime?.();
    };
  }, [disabled, locale]);

  useEffect(() => {
    if (disabled) return;
    retranslateAfterNavigation(locale);
  }, [disabled, locale, pathname]);

  return null;
}

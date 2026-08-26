"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  retranslateAfterNavigation,
  startGoogleTranslateRuntime,
} from "@/lib/i18n/google-translate-runtime";
import {
  applyUserContentTranslationPreference,
  clearReviewedCopyGoogleProtection,
  protectReviewedCopyFromGoogle,
  readAutoTranslateUserContentPreference,
} from "@/lib/i18n/user-content-translation";
import { automaticTranslationAllowedForPath } from "@/lib/i18n/translation-experience";

/**
 * Mounted once in the root layout. It owns Google's script, hidden element, cookie
 * normalization, route-change pass and overlay observer for the whole application;
 * `GoogleTranslateWidget` renders only the selector UI. Keeping this a single instance
 * is what stops one opened popover from triggering a full-document translation pass per
 * mounted selector.
 */
export function GoogleTranslateController({
  locale,
  catalogReady,
  disabled = false,
}: {
  locale: string;
  catalogReady: boolean;
  /** Fast local UI work uses reviewed catalog strings without loading Google's
   * remote runtime or allowing it to rewrite React's DOM during refreshes. */
  disabled?: boolean;
}) {
  const pathname = usePathname();
  const automaticAllowed = automaticTranslationAllowedForPath(pathname);
  const scope = catalogReady ? "user-content" : "page";
  const runtimeAllowed = catalogReady || automaticAllowed;
  const previousAutomaticAllowed = useRef(automaticAllowed);

  useEffect(() => {
    if (disabled || !runtimeAllowed) {
      document.body.setAttribute("translate", "no");
      return;
    }
    clearReviewedCopyGoogleProtection();
    applyUserContentTranslationPreference();
    const userContentEnabled = readAutoTranslateUserContentPreference();
    if (catalogReady && userContentEnabled) {
      protectReviewedCopyFromGoogle();
    }
    document.body.setAttribute(
      "translate",
      catalogReady && !userContentEnabled ? "no" : "yes",
    );
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const roots = [...record.addedNodes].filter(
          (node): node is HTMLElement => node instanceof HTMLElement,
        );
        if (record.type === "characterData" && record.target.parentElement) {
          roots.push(record.target.parentElement);
        }
        for (const root of roots) {
          applyUserContentTranslationPreference(root);
          if (catalogReady && userContentEnabled) {
            protectReviewedCopyFromGoogle(root);
          }
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    // A supported language uses Google only for explicitly opted-in user content.
    // An automatic public language uses the full-page fallback.
    const shouldStart =
      scope === "page" || userContentEnabled;
    const stopRuntime = shouldStart
      ? startGoogleTranslateRuntime(locale, scope)
      : undefined;
    return () => {
      observer.disconnect();
      stopRuntime?.();
      clearReviewedCopyGoogleProtection();
    };
  }, [catalogReady, disabled, locale, runtimeAllowed, scope]);

  useEffect(() => {
    if (disabled || !runtimeAllowed) return;
    retranslateAfterNavigation(locale, scope);
  }, [disabled, locale, pathname, runtimeAllowed, scope]);

  useEffect(() => {
    // Crossing from a public automatically translated page into an operational
    // surface must discard Google's mutated DOM before sensitive controls render.
    if (
      !catalogReady &&
      previousAutomaticAllowed.current &&
      !automaticAllowed
    ) {
      window.location.reload();
      return;
    }
    previousAutomaticAllowed.current = automaticAllowed;
  }, [automaticAllowed, catalogReady]);

  return null;
}

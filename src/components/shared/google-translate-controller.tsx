"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  retranslateAfterNavigation,
  startGoogleTranslateRuntime,
} from "@/lib/i18n/google-translate-runtime";

/**
 * Mounted once in the root layout. It owns Google's script, hidden element, cookie
 * normalization, route-change pass and overlay observer for the whole application;
 * `GoogleTranslateWidget` renders only the selector UI. Keeping this a single instance
 * is what stops one opened popover from triggering a full-document translation pass per
 * mounted selector.
 */
export function GoogleTranslateController({ locale }: { locale: string }) {
  const pathname = usePathname();

  useEffect(() => startGoogleTranslateRuntime(locale), [locale]);

  useEffect(() => {
    retranslateAfterNavigation(locale);
  }, [locale, pathname]);

  return null;
}

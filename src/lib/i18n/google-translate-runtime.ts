"use client";

import {
  GOOGLE_TRANSLATE_COOKIE,
  GOOGLE_TRANSLATE_SOURCE,
  SITE_LOCALE_COOKIE,
  googleTranslateCookieValue,
  normalizeLocaleCode,
} from "@/lib/i18n/locale-preference";

/**
 * Single owner of Google's page-translation layer.
 *
 * Every language selector used to run this bootstrap itself. Host and admin render two
 * responsive sidebar selectors plus a header one, and the consent dialog adds another,
 * so a single opened popover dispatched one full-document translation pass per mounted
 * instance — the main cause of the visible flicker. The runtime below is module-scoped:
 * the script, the hidden Google element, the route-change pass and the overlay observer
 * exist exactly once regardless of how many selectors are on screen, and selectors are
 * presentation-only consumers of `subscribeAutomaticLanguages`.
 */

declare global {
  interface Window {
    googleTranslateElementInit?: () => void;
    google?: {
      translate: {
        TranslateElement: {
          new (
            options: {
              pageLanguage: string;
              includedLanguages?: string;
              autoDisplay?: boolean;
            },
            elementId: string,
          ): unknown;
        };
      };
    };
  }
}

const SCRIPT_ID = "google-translate-script";
const ELEMENT_ID = "google_translate_element";

/** Overlay mutations arrive in bursts (a Radix popover mounts its wrapper, its content
 *  and its focus guards separately). Coalescing them into one pass is the difference
 *  between one retranslation and several per interaction. */
const OVERLAY_DELAY_MS = 150;
/** A committed route change should be picked up promptly, but still late enough to
 *  absorb the popovers and tooltips that mount with the new screen. */
const ROUTE_DELAY_MS = 50;

export interface AutomaticLanguage {
  code: string;
  name: string;
  searchTerms: string;
}

const NO_AUTOMATIC_LANGUAGES: readonly AutomaticLanguage[] = [];

let automaticLanguages: readonly AutomaticLanguage[] = NO_AUTOMATIC_LANGUAGES;
const listeners = new Set<() => void>();

export function subscribeAutomaticLanguages(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAutomaticLanguages(): readonly AutomaticLanguage[] {
  return automaticLanguages;
}

/** `useSyncExternalStore` requires a server snapshot with a stable identity. Google's
 *  list only exists in the browser, so the server always sees an empty list. */
export function getServerAutomaticLanguages(): readonly AutomaticLanguage[] {
  return NO_AUTOMATIC_LANGUAGES;
}

function publishAutomaticLanguages(next: AutomaticLanguage[]) {
  if (!next.length) return;
  if (
    next.length === automaticLanguages.length &&
    next.every((language, index) => language.code === automaticLanguages[index]?.code)
  ) {
    return;
  }
  automaticLanguages = next;
  for (const listener of listeners) listener();
}

function languageDisplayName(code: string, locale: string): string | null {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? null;
  } catch {
    return null;
  }
}

function translateSelect(): HTMLSelectElement | null {
  return document.querySelector<HTMLSelectElement>(`#${ELEMENT_ID} .goog-te-combo`);
}

function collectLanguages(displayLocale: string) {
  const select = translateSelect();
  if (!select) return;

  publishAutomaticLanguages(
    [...select.options]
      .filter((option) => option.value)
      .map((option) => {
        const code = option.value;
        const googleName = option.text.trim();
        const localizedName = languageDisplayName(code, displayLocale);
        const englishName = languageDisplayName(code, "en");
        const nativeName = languageDisplayName(code, code);
        return {
          code,
          name: localizedName ?? englishName ?? googleName,
          searchTerms: [googleName, localizedName, englishName, nativeName]
            .filter((name): name is string => Boolean(name))
            .join(" "),
        };
      })
      .filter((option) => option.name),
  );
}

function retranslate(locale: string): boolean {
  const select = translateSelect();
  if (!select) return false;

  const target =
    [...select.options].find((option) => option.value === locale)?.value ??
    [...select.options].find((option) => option.value === locale.split("-")[0])?.value;
  if (!target) return false;

  // The Google element lives outside the router's subtree, so client navigation swaps
  // page content without Google noticing. Dispatch even when the select already shows
  // the target: its change handler is what walks the newly committed DOM.
  select.value = target;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

let pendingPass: number | undefined;
let pendingDelay = Number.POSITIVE_INFINITY;

/** Coalesces every retranslation request into a single timer. A burst of overlay
 *  mutations and a route change therefore produce one pass, not one pass each. */
function schedulePass(locale: string, delay: number) {
  if (pendingPass !== undefined && delay >= pendingDelay) return;
  window.clearTimeout(pendingPass);
  pendingDelay = delay;
  pendingPass = window.setTimeout(() => {
    pendingPass = undefined;
    pendingDelay = Number.POSITIVE_INFINITY;
    retranslate(locale);
  }, delay);
}

function cancelPass() {
  window.clearTimeout(pendingPass);
  pendingPass = undefined;
  pendingDelay = Number.POSITIVE_INFINITY;
}

function ensureContainer(): HTMLElement {
  const existing = document.getElementById(ELEMENT_ID);
  if (existing) return existing;

  const container = document.createElement("div");
  container.id = ELEMENT_ID;
  container.setAttribute("aria-hidden", "true");
  document.body.appendChild(container);
  return container;
}

function cookieDomainsToClear(hostname: string): Array<string | undefined> {
  const hostnameParts = hostname.split(".");
  const domains: Array<string | undefined> = [undefined];
  for (let index = 0; index < hostnameParts.length - 1; index += 1) {
    const domain = hostnameParts.slice(index).join(".");
    domains.push(domain, `.${domain}`);
  }
  return domains;
}

export function syncBrowserLanguageCookies(code: string) {
  const locale = normalizeLocaleCode(code);
  if (!locale) return;

  const hostname = window.location.hostname;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  const common = `; path=/; samesite=lax${secure}`;

  // Older releases wrote googtrans at several parent-domain scopes. Remove every
  // possible duplicate first so Google and the server cannot read different values.
  for (const domain of cookieDomainsToClear(hostname)) {
    const domainAttribute = domain ? `; domain=${domain}` : "";
    document.cookie =
      `${GOOGLE_TRANSLATE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC` +
      `${common}${domainAttribute}`;
  }

  // Keep both cookies host-scoped. English is an explicit Google target too:
  // user-authored Macedonian (or any other source language) still needs /auto/en.
  document.cookie = `${SITE_LOCALE_COOKIE}=${locale}; max-age=31536000${common}`;
  document.cookie =
    `${GOOGLE_TRANSLATE_COOKIE}=${googleTranslateCookieValue(locale)}; ` +
    `max-age=31536000${common}`;
}

let mountCount = 0;
let teardown: (() => void) | undefined;

/**
 * Starts the shared runtime. Reference-counted rather than a boolean flag so React's
 * development double-invoke (mount → cleanup → mount) does not leave it stopped.
 */
export function startGoogleTranslateRuntime(locale: string): () => void {
  mountCount += 1;
  if (mountCount === 1) {
    teardown = install(locale);
  }

  return () => {
    mountCount -= 1;
    if (mountCount === 0) {
      teardown?.();
      teardown = undefined;
    }
  };
}

function install(locale: string): () => void {
  // Normalize legacy or duplicate Google cookies before its script reads them.
  syncBrowserLanguageCookies(locale);

  const container = ensureContainer();
  const languageObserver = new MutationObserver(() => collectLanguages(locale));
  languageObserver.observe(container, { childList: true, subtree: true });

  const initialize = () => {
    if (!window.google?.translate?.TranslateElement) return;
    if (!container.querySelector(".goog-te-combo")) {
      new window.google.translate.TranslateElement(
        { pageLanguage: GOOGLE_TRANSLATE_SOURCE, autoDisplay: false },
        ELEMENT_ID,
      );
    }
    collectLanguages(locale);
    retranslate(locale);
  };

  // Radix renders dialogs and popovers into body-level portals, which Google's own
  // observer does not reliably pick up. Watch for them, but translate once per burst.
  const overlayObserver = new MutationObserver((mutations) => {
    const addedOverlay = mutations.some((mutation) =>
      [...mutation.addedNodes].some(
        (node) =>
          node instanceof Element &&
          (node.matches('[role="dialog"], [data-radix-popper-content-wrapper]') ||
            Boolean(
              node.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]'),
            )),
      ),
    );
    if (addedOverlay) schedulePass(locale, OVERLAY_DELAY_MS);
  });
  overlayObserver.observe(document.body, { childList: true, subtree: true });

  window.googleTranslateElementInit = initialize;
  if (document.getElementById(SCRIPT_ID)) {
    initialize();
  } else {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.body.appendChild(script);
  }

  return () => {
    languageObserver.disconnect();
    overlayObserver.disconnect();
    cancelPass();
  };
}

/** Requests a pass after a committed client navigation. */
export function retranslateAfterNavigation(locale: string) {
  schedulePass(locale, ROUTE_DELAY_MS);
}

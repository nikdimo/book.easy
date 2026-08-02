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
 * the script, the hidden Google element, the route-change pass and the content observer
 * exist exactly once regardless of how many selectors are on screen, and selectors are
 * presentation-only consumers of `subscribeAutomaticLanguages`.
 *
 * The second cause was frequency. Google translates a page by restoring it to its source
 * language and translating the result, so a pass that has nothing to do is still visible
 * as the whole document blinking to English and back. Every popover, dialog and route
 * change used to dispatch one. A pass is now gated on the DOM actually holding source
 * text Google has not already been offered — see `retranslate` — which for a reviewed
 * locale means ordinary interactions dispatch nothing at all.
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
/** How long Google is given to finish a dispatched pass before whatever source text is
 *  still on screen is recorded as already offered to it. Overshooting is harmless — the
 *  record only decides whether a *future* interaction is allowed to dispatch again. */
const PASS_SETTLE_MS = 1000;

/** Tags that never hold translatable interface copy. `FONT` is Google's own output:
 *  it wraps every string it translates in nested `<font>` elements, so skipping the tag
 *  is what tells "already handled" apart from "still in the source language". */
const NON_TRANSLATABLE_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEXTAREA",
  "FONT",
  "IFRAME",
]);

const LETTER = /\p{L}/u;

/** Source text already offered to Google, keyed by the exact value that was offered.
 *  A `WeakMap` keeps this tied to node lifetime — nodes discarded by a route change are
 *  collected with it — and storing the value alongside means React mutating a text node
 *  in place (`nodeValue = …`, no new node) still counts as new content. */
const offeredText = new WeakMap<Text, string>();

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

/** Subtrees a pass would never change: Google's own markup and output, and the copy the
 *  server already resolved from the reviewed catalog (which is marked `notranslate`
 *  precisely so Google leaves it alone). */
function isOpaqueSubtree(element: Element): boolean {
  return (
    NON_TRANSLATABLE_TAGS.has(element.tagName) ||
    element.id === ELEMENT_ID ||
    element.classList.contains("notranslate") ||
    element.classList.contains("skiptranslate") ||
    element.getAttribute("translate") === "no"
  );
}

/** Walks the text nodes a pass could act on: everything outside an opaque subtree that
 *  contains at least one letter. Prices, counts and separators are excluded — Google
 *  leaves them in place, so counting them would make every check report work to do. */
function sourceTextWalker(root: Element): TreeWalker {
  return document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        return isOpaqueSubtree(node as Element)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_SKIP;
      }
      return LETTER.test(node.nodeValue ?? "")
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
}

function hasUnofferedText(root: Element): boolean {
  if (isOpaqueSubtree(root)) return false;
  const walker = sourceTextWalker(root);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (offeredText.get(text) !== text.nodeValue) return true;
  }
  return false;
}

function recordOfferedText(): void {
  const walker = sourceTextWalker(document.body);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    offeredText.set(text, text.nodeValue ?? "");
  }
}

let pendingRecord: number | undefined;

function retranslate(locale: string): boolean {
  const select = translateSelect();
  if (!select) return false;

  const target =
    [...select.options].find((option) => option.value === locale)?.value ??
    [...select.options].find((option) => option.value === locale.split("-")[0])?.value;
  if (!target) return false;

  // A dispatched pass restores the whole document to its source language before
  // translating it again, so an unnecessary one is visible as the page blinking to
  // English and back. Reviewed copy arrives from the server already translated and
  // marked `notranslate`, which means most interactions — opening a popover, closing a
  // dialog, committing a route whose content is fully covered — introduce no source
  // text at all and must not dispatch.
  if (!hasUnofferedText(document.body)) return true;

  // The Google element lives outside the router's subtree, so client navigation swaps
  // page content without Google noticing. Dispatch even when the select already shows
  // the target: its change handler is what walks the newly committed DOM.
  select.value = target;
  select.dispatchEvent(new Event("change", { bubbles: true }));

  // Whatever is still in the source language once the pass settles was offered to
  // Google and either translated or deliberately left alone; either way, re-dispatching
  // for it on the next click would restore the document for nothing.
  window.clearTimeout(pendingRecord);
  pendingRecord = window.setTimeout(recordOfferedText, PASS_SETTLE_MS);
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
  window.clearTimeout(pendingRecord);
  pendingPass = undefined;
  pendingRecord = undefined;
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
  // observer does not reliably pick up. The trigger is content rather than the overlay
  // role: a popover built entirely from reviewed `notranslate` copy needs no pass, and
  // scheduling one for it was the flicker on every click. Google's own mutations are
  // ignored here — translating adds `<font>` elements (an opaque tag) and restoring
  // adds bare text nodes (not elements), so neither can schedule a pass of its own.
  const contentObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (hasUnofferedText(node as Element)) {
          schedulePass(locale, OVERLAY_DELAY_MS);
          return;
        }
      }
    }
  });
  contentObserver.observe(document.body, { childList: true, subtree: true });

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
    contentObserver.disconnect();
    cancelPass();
  };
}

/** Requests a pass after a committed client navigation. */
export function retranslateAfterNavigation(locale: string) {
  schedulePass(locale, ROUTE_DELAY_MS);
}

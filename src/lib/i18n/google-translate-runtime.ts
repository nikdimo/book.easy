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
 *
 * That gate is keyed by *value*, and this is the part that has to stay that way. Keying
 * it by text node — which is what it did originally — cannot work in a React tree: Radix
 * discards a closed popover's nodes and builds new ones on the next open, so identical
 * copy came back as brand new text nodes and dispatched a full pass on every single
 * interaction. Worse, Google's restore step moves each translated `<font>`'s children
 * back into their parent, which the content observer below saw as freshly added elements
 * holding source text, so one pass scheduled the next and the page flickered continuously
 * while Google refetched translations. `passSuppressedUntil` closes that loop, and
 * `MIN_PASS_INTERVAL_MS` caps how often a pass can be dispatched at all.
 *
 * Skipping a pass is safe: Google's own script observes `document.body` with
 * `{childList, characterData, subtree}` for as long as a translation session is live and
 * translates nodes added after the fact incrementally — no restore, no flicker. The
 * dispatch below exists for the cases that observer does not cover, not as the only path
 * by which new content reaches Google.
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
/** How long Google is given to finish a dispatched pass. For that window the content
 *  observer stands down, because a pass *is* a burst of DOM mutations: restoring the
 *  document moves every translated `<font>`'s children back into place, and those
 *  re-insertions are indistinguishable from application content arriving. */
const PASS_SETTLE_MS = 1000;
/** Floor on the interval between dispatched passes: a backstop so a mutation source
 *  nobody anticipated degrades to an occasional restore rather than a continuous
 *  flicker. Kept just above `PASS_SETTLE_MS` on purpose — a request deferred by this is
 *  usually a real route change, and holding new content in the source language to
 *  enforce a longer quiet period would trade one visible defect for another. */
const MIN_PASS_INTERVAL_MS = 1500;
/** Bound on the offered-text ledger. Fixed copy plus listing content settles well below
 *  this; the cap only matters for a session that browses enough distinct pages to make
 *  the set worth dropping, and dropping it costs one extra pass. */
const MAX_OFFERED_ENTRIES = 5000;

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

/** Source strings already handed to Google, keyed by value. Node identity is useless
 *  here: the same sentence is a different `Text` object every time React remounts the
 *  component that renders it, so an identity-keyed ledger reports unchanged copy as new
 *  work forever. Whitespace is collapsed so JSX indentation does not split one string
 *  into several entries. */
const offeredText = new Set<string>();

const WHITESPACE = /\s+/g;

function offeredKey(value: string | null): string {
  return (value ?? "").replace(WHITESPACE, " ").trim();
}

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

/**
 * The locale the cookies and Google's target currently point at — the visitor's actual
 * choice, which is not always what the fixed-copy catalog resolved to.
 *
 * Published from here rather than passed down because a selector renders in the header,
 * both responsive host sidebars, the admin sidebar and the consent dialog, and the ones
 * outside the public layout had no `currentLocale` prop to pass. They therefore fell back
 * to the catalog locale and displayed "English" while the visitor was reading Portuguese.
 * One source of truth removes the whole class of "this call site forgot the prop" bug.
 */
let activeLocale: string | null = null;
const localeListeners = new Set<() => void>();

export function subscribeActiveLocale(listener: () => void): () => void {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

export function getActiveLocale(): string | null {
  return activeLocale;
}

/** The server cannot know the browser's cookies here, so it renders from the prop the
 *  call site supplied and the store takes over on hydration. */
export function getServerActiveLocale(): null {
  return null;
}

function publishActiveLocale(locale: string) {
  if (activeLocale === locale) return;
  activeLocale = locale;
  for (const listener of localeListeners) listener();
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

/** `isOpaqueSubtree` only describes the element it is handed, which is not enough for a
 *  node the observer reports: Radix adds children *into* an already-mounted popover, and
 *  Google keeps rebuilding the `<option>` list inside its own container. Both arrive as
 *  additions whose protection lives on an ancestor. */
function isInOpaqueContext(node: Element): boolean {
  for (
    let element: Element | null = node;
    element && element !== document.body;
    element = element.parentElement
  ) {
    if (isOpaqueSubtree(element)) return true;
  }
  return false;
}

function hasUnofferedText(root: Element): boolean {
  if (isInOpaqueContext(root)) return false;
  const walker = sourceTextWalker(root);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!offeredText.has(offeredKey(node.nodeValue))) return true;
  }
  return false;
}

function recordOfferedText(root: Element = document.body): void {
  if (offeredText.size > MAX_OFFERED_ENTRIES) offeredText.clear();
  const walker = sourceTextWalker(root);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    offeredText.add(offeredKey(node.nodeValue));
  }
}

let pendingRecord: number | undefined;
let passSuppressedUntil = 0;
let lastPassAt = Number.NEGATIVE_INFINITY;

/** Milliseconds to wait before a pass may be dispatched, or 0 when one may go now. */
function passCooldown(now: number): number {
  return Math.max(0, lastPassAt + MIN_PASS_INTERVAL_MS - now);
}

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

  // Record before dispatching, not after. Recording afterwards only ever captured the
  // text Google had declined to translate, because anything it did translate sits inside
  // a `<font>` the walker rejects — so every string Google handled successfully stayed
  // unrecorded and re-dispatched the moment its component remounted.
  recordOfferedText();
  lastPassAt = Date.now();
  passSuppressedUntil = lastPassAt + PASS_SETTLE_MS;

  // The Google element lives outside the router's subtree, so client navigation swaps
  // page content without Google noticing. Dispatch even when the select already shows
  // the target: its change handler is what walks the newly committed DOM.
  select.value = target;
  select.dispatchEvent(new Event("change", { bubbles: true }));

  // Google's restore and translate steps rewrite the document asynchronously. Sweeping
  // again once they settle picks up anything the application rendered mid-pass, so that
  // content does not dispatch a second pass on the next click.
  window.clearTimeout(pendingRecord);
  pendingRecord = window.setTimeout(() => recordOfferedText(), PASS_SETTLE_MS);
  return true;
}

let pendingPass: number | undefined;
let pendingDelay = Number.POSITIVE_INFINITY;

/** Coalesces every retranslation request into a single timer. A burst of overlay
 *  mutations and a route change therefore produce one pass, not one pass each. The
 *  cooldown is applied by *deferring* rather than dropping, so a request that arrives
 *  too soon after the previous pass still runs — a dropped one would leave genuinely new
 *  content untranslated. */
function schedulePass(locale: string, delay: number) {
  const effectiveDelay = Math.max(delay, passCooldown(Date.now()));
  if (pendingPass !== undefined && effectiveDelay >= pendingDelay) return;
  window.clearTimeout(pendingPass);
  pendingDelay = effectiveDelay;
  pendingPass = window.setTimeout(() => {
    pendingPass = undefined;
    pendingDelay = Number.POSITIVE_INFINITY;
    retranslate(locale);
  }, effectiveDelay);
}

function cancelPass() {
  window.clearTimeout(pendingPass);
  window.clearTimeout(pendingRecord);
  pendingPass = undefined;
  pendingRecord = undefined;
  pendingDelay = Number.POSITIVE_INFINITY;
  passSuppressedUntil = 0;
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

  publishActiveLocale(locale);

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
  // scheduling one for it was the flicker on every click.
  //
  // A dispatched pass is deliberately deaf here. Google's restore does not merely swap
  // text: it lifts each `<font>`'s children back into the surrounding element, and those
  // re-inserted elements carry source text, so an observing pass fed itself the reason to
  // run again and the document kept blinking for as long as the user stayed on the page.
  const contentObserver = new MutationObserver((mutations) => {
    if (Date.now() < passSuppressedUntil) return;
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

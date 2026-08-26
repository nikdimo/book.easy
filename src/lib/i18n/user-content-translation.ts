export const AUTO_TRANSLATE_USER_CONTENT_COOKIE =
  "bookeasy_auto_translate_user_content";

const TRANSLATABLE_USER_CONTENT_SELECTOR =
  "[data-translatable-user-content]";
const REVIEWED_COPY_PROTECTION_ATTRIBUTE =
  "data-reviewed-copy-translation-protection";

export function autoTranslateUserContentEnabled(cookieValue?: string | null) {
  return cookieValue !== "0";
}

export function readAutoTranslateUserContentPreference(): boolean {
  if (typeof document === "undefined") return true;
  const value = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTO_TRANSLATE_USER_CONTENT_COOKIE}=`))
    ?.slice(AUTO_TRANSLATE_USER_CONTENT_COOKIE.length + 1);
  return autoTranslateUserContentEnabled(value);
}

export function writeAutoTranslateUserContentPreference(enabled: boolean) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${AUTO_TRANSLATE_USER_CONTENT_COOKIE}=${enabled ? "1" : "0"}; max-age=31536000; path=/; samesite=lax${secure}`;
}

/** Google Translate respects `notranslate` on the content node itself. Keep the
 * marker separate so enabling the preference only removes classes that this
 * feature owns, never the app's reviewed-copy protection. */
export function applyUserContentTranslationPreference(root: ParentNode = document) {
  if (typeof document === "undefined") return;
  const enabled = readAutoTranslateUserContentPreference();
  const elements = [
    ...(root instanceof HTMLElement && root.matches("[data-user-generated-content]")
      ? [root]
      : []),
    ...root.querySelectorAll<HTMLElement>("[data-user-generated-content]"),
  ];

  elements.forEach((element) => {
    const isTranslatable = element.hasAttribute(
      "data-translatable-user-content",
    );
    element.classList.toggle("notranslate", !enabled || !isTranslatable);
    // Google Translate can retain an earlier `translate="no"` decision while it
    // processes a page. Explicitly opting host-authored content back in makes a
    // changed preference reliable for listing titles, descriptions, and reviews.
    if (enabled && isTranslatable) element.setAttribute("translate", "yes");
    else element.setAttribute("translate", "no");
  });
}

/**
 * Google's browser widget cannot translate a `translate="yes"` child beneath a
 * `translate="no"` body. For a reviewed language we therefore protect each actual
 * interface text owner before making the body eligible for translation. Only the
 * deliberately opted-in listing/review subtrees remain visible to Google.
 *
 * Protection is applied to the closest element that directly owns meaningful text,
 * rather than to a page wrapper. That distinction matters: protecting a card wrapper
 * would also protect an opted-in listing title nested inside the card.
 */
export function protectReviewedCopyFromGoogle(
  root: ParentNode = document.body,
) {
  if (typeof document === "undefined") return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue?.trim()) continue;
    const owner = node.parentElement;
    if (!owner || owner === document.body || owner === document.documentElement) {
      continue;
    }
    if (owner.closest(TRANSLATABLE_USER_CONTENT_SELECTOR)) continue;
    if (
      owner.closest(
        "script, style, noscript, template, .skiptranslate, #bookeasy-google-translate",
      )
    ) {
      continue;
    }
    if (owner.closest('.notranslate, [translate="no"]')) continue;
    // Do not protect an ancestor of opted-in prose. Its direct text is uncommon,
    // while an ancestor-level opt-out would prevent every nested title or review.
    if (owner.querySelector(TRANSLATABLE_USER_CONTENT_SELECTOR)) continue;

    owner.classList.add("notranslate");
    owner.setAttribute("translate", "no");
    owner.setAttribute(REVIEWED_COPY_PROTECTION_ATTRIBUTE, "true");
  }
}

/** Remove only protection owned by the reviewed-copy isolation layer. Existing
 * `notranslate` markers (names, addresses, codes, prices) remain protected. */
export function clearReviewedCopyGoogleProtection(
  root: ParentNode = document,
) {
  if (typeof document === "undefined") return;
  const selector = `[${REVIEWED_COPY_PROTECTION_ATTRIBUTE}]`;
  const elements = [
    ...(root instanceof HTMLElement && root.matches(selector) ? [root] : []),
    ...root.querySelectorAll<HTMLElement>(selector),
  ];
  elements.forEach((element) => {
    element.classList.remove("notranslate");
    element.removeAttribute("translate");
    element.removeAttribute(REVIEWED_COPY_PROTECTION_ATTRIBUTE);
  });
}

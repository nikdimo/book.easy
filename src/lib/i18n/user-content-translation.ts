export const AUTO_TRANSLATE_USER_CONTENT_COOKIE =
  "bookeasy_auto_translate_user_content";

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
    element.classList.toggle("notranslate", !enabled);
    // Google Translate can retain an earlier `translate="no"` decision while it
    // processes a page. Explicitly opting host-authored content back in makes a
    // changed preference reliable for listing titles, descriptions, and reviews.
    if (enabled) element.setAttribute("translate", "yes");
    else element.setAttribute("translate", "no");
  });
}

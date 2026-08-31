/**
 * Facebook group URLs, reduced to one canonical form.
 *
 * A host pastes whatever their browser or phone gave them: `m.facebook.com` from the
 * app, `web.facebook.com` from a desktop tab someone forwarded, `?ref=share` and
 * `?__cft__[0]=...` trackers, a `#` fragment, an occasional missing scheme. All of
 * those are the same group, and the storage layer's `@@unique([hostId, url])` can only
 * say so if they arrive spelled identically — so canonicalization happens here, once,
 * before anything is written or compared.
 *
 * Nothing in this file talks to Facebook. It parses a string.
 */

/** Hostnames that serve the same graph. `www` is the canonical one. */
const FACEBOOK_HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "mobile.facebook.com",
  "web.facebook.com",
  "business.facebook.com",
  "fb.com",
  "www.fb.com",
]);

const CANONICAL_HOST = "www.facebook.com";

export type FacebookGroupUrlError =
  | "EMPTY"
  | "NOT_A_URL"
  | "NOT_FACEBOOK"
  | "NOT_A_GROUP";

export type FacebookGroupUrlResult =
  | { ok: true; url: string; groupId: string }
  | { ok: false; error: FacebookGroupUrlError };

/**
 * A group's identifier as it appears in the path: either the numeric id Facebook
 * assigns, or the vanity slug an admin set. Both are `[A-Za-z0-9._-]`, and both are
 * case-sensitive as far as Facebook is concerned for vanity slugs — but Facebook
 * resolves them case-insensitively, so they are lowercased to keep
 * `/groups/SkopjeRentals` and `/groups/skopjerentals` from becoming two saved rows.
 */
const GROUP_ID = /^[A-Za-z0-9._-]+$/;

/** Path prefixes Facebook uses for groups. `/groups/<id>` is the modern one; the
 *  older `/group.php?gid=` form still arrives from bookmarks. */
function groupIdFromUrl(parsed: URL): string | null {
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (segments[0] === "groups" && segments[1] && GROUP_ID.test(segments[1])) {
    // Anything after the id — `/posts/123`, `/about`, `/permalink/...` — is a place
    // inside the group, not a different group. The saved destination is the group.
    return segments[1];
  }

  if (segments[0] === "group.php") {
    const gid = parsed.searchParams.get("gid");
    if (gid && GROUP_ID.test(gid)) return gid;
  }

  return null;
}

/**
 * Validates and canonicalizes a pasted Facebook group URL.
 *
 * Deliberately strict about *which* Facebook paths count. A profile, a page or a
 * marketplace listing is not a group, and saving one under "Open selected group" would
 * put the host somewhere the button did not promise.
 */
export function normalizeFacebookGroupUrl(input: string): FacebookGroupUrlResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "EMPTY" };

  // A host who copied the address bar of an already-open tab usually has the scheme;
  // one who typed it from memory usually does not. Assume https rather than rejecting,
  // but never assume it over something that already declared a scheme — `javascript:`
  // and `data:` have to reach the host check below and fail it.
  const candidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, error: "NOT_A_URL" };
  }

  // http is upgraded rather than refused — the destination is the same group, and the
  // canonical form this returns is https. Any other scheme is not a web address a new
  // tab should be pointed at.
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "NOT_FACEBOOK" };
  }

  if (!FACEBOOK_HOSTS.has(parsed.hostname.toLowerCase())) {
    return { ok: false, error: "NOT_FACEBOOK" };
  }

  const groupId = groupIdFromUrl(parsed);
  if (!groupId) return { ok: false, error: "NOT_A_GROUP" };

  const normalizedId = groupId.toLowerCase();

  // Rebuilt rather than edited: every query parameter, fragment, port, credential and
  // trailing slash the paste carried is dropped by construction, so a new Facebook
  // tracking parameter cannot leak into the stored value later.
  return {
    ok: true,
    url: `https://${CANONICAL_HOST}/groups/${normalizedId}`,
    groupId: normalizedId,
  };
}

/**
 * Whether a stored destination URL is still safe to hand to `window.open`.
 *
 * Rows written before a normalization change, or an operator editing the database
 * directly, are the cases this exists for. The workspace calls it on the way out so
 * an unexpected value fails closed instead of opening.
 */
export function isSafeFacebookGroupUrl(url: string): boolean {
  const result = normalizeFacebookGroupUrl(url);
  return result.ok && result.url === url;
}

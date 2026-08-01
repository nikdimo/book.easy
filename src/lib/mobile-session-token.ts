import "server-only";

import { SignJWT, jwtVerify } from "jose";

/** Bearer tokens for the native app.
 *
 *  The Expo web preview rides the normal session cookie, but an installed APK
 *  cannot: sign-in happens in the system browser, whose cookie jar is completely
 *  separate from the app's HTTP client. So native gets a token instead.
 *
 *  Two token kinds, both signed with AUTH_SECRET and distinguished by audience so
 *  one can never be used where the other is expected:
 *
 *   - `handoff` is what the deep link carries back from the browser. It lives for
 *     sixty seconds and does nothing except buy a session token. A deep link is
 *     visible to any app that registers the same URL scheme, so the window in which
 *     a stolen one is worth anything is deliberately tiny.
 *   - `session` is what the app stores and sends as a Bearer header.
 *
 *  Both are stateless, which is the tradeoff: no table, no migration, but also no
 *  server-side revocation before expiry. Acceptable for a token that lasts days
 *  rather than months; if per-device revocation is needed later, that is a stored
 *  token id checked on verify, not a redesign.
 */

const HANDOFF_AUDIENCE = "linger-mobile-handoff";
const SESSION_AUDIENCE = "linger-mobile-session";
const HANDOFF_TTL = "60s";
const SESSION_TTL = "30d";

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required to issue mobile tokens");
  return new TextEncoder().encode(value);
}

async function sign(userId: string, audience: string, ttl: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret());
}

async function verify(token: string, audience: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience });
    return typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    // Expired, wrong audience, or tampered with — all the same answer to a caller.
    return null;
  }
}

export function createMobileHandoffToken(userId: string) {
  return sign(userId, HANDOFF_AUDIENCE, HANDOFF_TTL);
}

export function readMobileHandoffToken(token: string) {
  return verify(token, HANDOFF_AUDIENCE);
}

export function createMobileSessionToken(userId: string) {
  return sign(userId, SESSION_AUDIENCE, SESSION_TTL);
}

export function readMobileSessionToken(token: string) {
  return verify(token, SESSION_AUDIENCE);
}

/** Pulls the bearer token out of an Authorization header, if there is one. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const value = header.slice(7).trim();
  return value.length > 0 ? value : null;
}

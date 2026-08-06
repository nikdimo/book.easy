import NextAuth from "next-auth";
import type { NextAuthRequest } from "next-auth";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import {
  DISPLAY_CURRENCY_COOKIE,
  DISPLAY_CURRENCY_EXPLICIT_COOKIE,
  resolveCurrencyPreference,
} from "@/lib/currency/currency-preference";
import {
  GOOGLE_TRANSLATE_COOKIE,
  SITE_LOCALE_COOKIE,
  googleTranslateCookieValue,
  resolveLocalePreference,
} from "@/lib/i18n/locale-preference";

const { auth } = NextAuth(authConfig);

/** What the request's own cookie header should say by the time a page renders, so
 *  that `getLocale()` and `getDisplayCurrency()` read the *resolved* values rather
 *  than whatever the browser happened to send. Without this, a first-time visitor's
 *  first page would render in the fallback language and currency and only correct
 *  itself on the second request — the visible flash the story rules out. */
interface RegionalSettings {
  locale: string;
  currency: string;
}

function requestHeadersWithSettings(
  req: NextRequest,
  { locale, currency }: RegionalSettings,
): Headers {
  const headers = new Headers(req.headers);
  const managedCookies = new Set([
    SITE_LOCALE_COOKIE,
    GOOGLE_TRANSLATE_COOKIE,
    DISPLAY_CURRENCY_COOKIE,
    DISPLAY_CURRENCY_EXPLICIT_COOKIE,
  ]);
  const existingCookies = (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const separator = part.indexOf("=");
      return separator < 0 || !managedCookies.has(part.slice(0, separator));
    });

  existingCookies.push(
    `${SITE_LOCALE_COOKIE}=${locale}`,
    `${GOOGLE_TRANSLATE_COOKIE}=${googleTranslateCookieValue(locale)}`,
    `${DISPLAY_CURRENCY_COOKIE}=${currency}`,
  );
  const explicitMarker = req.cookies.get(DISPLAY_CURRENCY_EXPLICIT_COOKIE)?.value;
  if (explicitMarker) {
    existingCookies.push(`${DISPLAY_CURRENCY_EXPLICIT_COOKIE}=${explicitMarker}`);
  }
  headers.set("cookie", existingCookies.join("; "));
  return headers;
}

/**
 * Language and currency are resolved together from one country signal but stay
 * independent preferences — each has its own cookie and its own priority chain, so
 * changing one never rewrites the other. Detection only ever supplies a default:
 * both resolvers put a stored choice ahead of the IP country.
 */
function requestSettings(req: NextRequest, accountCurrency?: string | null): RegionalSettings {
  const country = req.headers.get("cf-ipcountry");

  return {
    locale: resolveLocalePreference({
      siteLocale: req.cookies.get(SITE_LOCALE_COOKIE)?.value,
      googleTranslate: req.cookies.get(GOOGLE_TRANSLATE_COOKIE)?.value,
      country,
    }).locale,
    currency: resolveCurrencyPreference({
      explicit:
        req.cookies.get(DISPLAY_CURRENCY_EXPLICIT_COOKIE)?.value === "1"
          ? req.cookies.get(DISPLAY_CURRENCY_COOKIE)?.value
          : null,
      // Read off the JWT, never the database: this runs on every request in the Edge
      // runtime, where Prisma is unavailable and a per-request query would be far too
      // expensive. It is what carries the preference to a second device.
      account: accountCurrency,
      browser: req.cookies.get(DISPLAY_CURRENCY_COOKIE)?.value,
      country,
    }).currency,
  };
}

function persistSettings(
  response: NextResponse,
  req: NextRequest,
  { locale, currency }: RegionalSettings,
) {
  const options = {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax" as const,
    secure: req.nextUrl.protocol === "https:",
  };

  if (req.cookies.get(SITE_LOCALE_COOKIE)?.value !== locale) {
    response.cookies.set(SITE_LOCALE_COOKIE, locale, options);
  }

  const googleValue = googleTranslateCookieValue(locale);
  if (req.cookies.get(GOOGLE_TRANSLATE_COOKIE)?.value !== googleValue) {
    response.cookies.set(GOOGLE_TRANSLATE_COOKIE, googleValue, options);
  }

  if (req.cookies.get(DISPLAY_CURRENCY_COOKIE)?.value !== currency) {
    response.cookies.set(DISPLAY_CURRENCY_COOKIE, currency, options);
  }
  return response;
}

function continueWithSettings(req: NextRequest, accountCurrency?: string | null) {
  const settings = requestSettings(req, accountCurrency);
  const response = NextResponse.next({
    request: { headers: requestHeadersWithSettings(req, settings) },
  });
  return persistSettings(response, req, settings);
}

function redirectWithSettings(
  req: NextRequest,
  url: URL,
  accountCurrency?: string | null,
) {
  return persistSettings(
    NextResponse.redirect(url),
    req,
    requestSettings(req, accountCurrency),
  );
}

/**
 * Runs for every request, not only the authenticated areas. Public pages need it
 * too now: the signed-in account's display currency rides on the JWT, and reading
 * it is what lets a preference set on one device apply to a marketplace page opened
 * on another. Decoding the session cookie is a local HMAC check — `authConfig` is
 * the deliberately Edge-safe subset with no adapter and no providers — so this adds
 * no I/O to a public request, and none at all for a visitor with no session cookie.
 */
const proxyWithSession = auth((req: NextAuthRequest, event: NextFetchEvent) => {
  // The second parameter selects NextAuth's Proxy overload rather than its Route
  // Handler overload. Authentication itself does not need the event object.
  void event;
  const { pathname, search } = req.nextUrl;
  // Round-trip the query string too, not just the path. Deep links that carry state —
  // the account-deletion confirmation link is one — are dead on arrival otherwise,
  // since signing in would drop the very parameter the page needs.
  const returnTo = `${pathname}${search}`;
  // A real session must have a concrete user id. Checking only `!!req.auth` used to
  // fail open in affected Auth.js releases when configuration errors produced a
  // truthy error object instead of a session.
  const isLoggedIn = Boolean(req.auth?.user?.id);
  const userRole = req.auth?.user?.role;
  const isHost = req.auth?.user?.isHost;
  const accountCurrency = req.auth?.user?.displayCurrency;

  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn || userRole !== "ADMIN") {
      return redirectWithSettings(req, new URL("/login", req.nextUrl), accountCurrency);
    }
  }

  if (pathname.startsWith("/account") || pathname.startsWith("/bookings/confirm")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", req.nextUrl);
      loginUrl.searchParams.set("callbackUrl", returnTo);
      return redirectWithSettings(req, loginUrl, accountCurrency);
    }
  }

  if (pathname.startsWith("/host")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", req.nextUrl);
      loginUrl.searchParams.set("callbackUrl", returnTo);
      return redirectWithSettings(req, loginUrl, accountCurrency);
    }
    if (!isHost && userRole !== "ADMIN") {
      return redirectWithSettings(
        req,
        new URL("/account/become-host", req.nextUrl),
        accountCurrency,
      );
    }
  }

  return continueWithSettings(req, accountCurrency);
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  return proxyWithSession(req, event);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|uploads|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

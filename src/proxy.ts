import NextAuth from "next-auth";
import type { NextAuthRequest } from "next-auth";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import {
  GOOGLE_TRANSLATE_COOKIE,
  SITE_LOCALE_COOKIE,
  googleTranslateCookieValue,
  resolveLocalePreference,
} from "@/lib/i18n/locale-preference";

const { auth } = NextAuth(authConfig);

function requestHeadersWithLocale(req: NextRequest, locale: string): Headers {
  const headers = new Headers(req.headers);
  const localeCookieNames = new Set([SITE_LOCALE_COOKIE, GOOGLE_TRANSLATE_COOKIE]);
  const existingCookies = (headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const separator = part.indexOf("=");
      return separator < 0 || !localeCookieNames.has(part.slice(0, separator));
    });

  existingCookies.push(
    `${SITE_LOCALE_COOKIE}=${locale}`,
    `${GOOGLE_TRANSLATE_COOKIE}=${googleTranslateCookieValue(locale)}`
  );
  headers.set("cookie", existingCookies.join("; "));
  return headers;
}

function requestLocale(req: NextRequest): string {
  return resolveLocalePreference({
    siteLocale: req.cookies.get(SITE_LOCALE_COOKIE)?.value,
    googleTranslate: req.cookies.get(GOOGLE_TRANSLATE_COOKIE)?.value,
    country: req.headers.get("cf-ipcountry"),
  }).locale;
}

function persistLocale(response: NextResponse, req: NextRequest, locale: string) {
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
  return response;
}

function continueWithLocale(req: NextRequest) {
  const locale = requestLocale(req);
  const response = NextResponse.next({
    request: { headers: requestHeadersWithLocale(req, locale) },
  });
  return persistLocale(response, req, locale);
}

function redirectWithLocale(req: NextRequest, url: URL) {
  return persistLocale(NextResponse.redirect(url), req, requestLocale(req));
}

const authenticatedProxy = auth((req: NextAuthRequest, event: NextFetchEvent) => {
  // The second parameter selects NextAuth's Proxy overload rather than its Route
  // Handler overload. Authentication itself does not need the event object.
  void event;
  const { pathname, search } = req.nextUrl;
  // Round-trip the query string too, not just the path. Deep links that carry state —
  // the account-deletion confirmation link is one — are dead on arrival otherwise,
  // since signing in would drop the very parameter the page needs.
  const returnTo = `${pathname}${search}`;
  const isLoggedIn = !!req.auth;
  const userRole = req.auth?.user?.role;
  const isHost = req.auth?.user?.isHost;

  if (pathname.startsWith("/admin")) {
    if (!isLoggedIn || userRole !== "ADMIN") {
      return redirectWithLocale(req, new URL("/login", req.nextUrl));
    }
  }

  if (pathname.startsWith("/account") || pathname.startsWith("/bookings/confirm")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", req.nextUrl);
      loginUrl.searchParams.set("callbackUrl", returnTo);
      return redirectWithLocale(req, loginUrl);
    }
  }

  if (pathname.startsWith("/host")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", req.nextUrl);
      loginUrl.searchParams.set("callbackUrl", returnTo);
      return redirectWithLocale(req, loginUrl);
    }
    if (!isHost && userRole !== "ADMIN") {
      return redirectWithLocale(req, new URL("/account/become-host", req.nextUrl));
    }
  }

  return continueWithLocale(req);
});

function requiresAuthentication(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/host") ||
    pathname === "/bookings/confirm"
  );
}

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (requiresAuthentication(req.nextUrl.pathname)) {
    return authenticatedProxy(req, event);
  }
  return continueWithLocale(req);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|uploads|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

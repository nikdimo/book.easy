import { NextResponse } from "next/server";

type RedirectStatus = 301 | 302 | 303 | 307 | 308;

/**
 * Redirect to another page on this site without trusting the request origin.
 *
 * In production, the reverse proxy can expose its internal localhost origin to
 * Route Handlers. A relative Location header lets the browser keep the public
 * lingerhomes.com origin and also prevents accidental external redirects.
 */
export function relativeRedirect(location: string, status: RedirectStatus = 307) {
  if (!location.startsWith("/") || location.startsWith("//")) {
    throw new Error("Relative redirects must use a site-relative path.");
  }

  return new NextResponse(null, {
    status,
    headers: { Location: location },
  });
}

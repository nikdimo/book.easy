import { NextResponse, type NextRequest } from "next/server";
import {
  HOST_PANEL_COOKIE,
  hostPanelDestination,
} from "@/lib/host/host-panel-preference";

/**
 * The host panel's stable entry URL.
 *
 * It used to read `?version=` and remember the answer. There is one panel now, so the
 * parameter is ignored rather than rejected — a bookmarked `?version=current` from the
 * days of the switch has to land in the panel, not on a 400 — and the visit is also
 * what expires the leftover cookie.
 */
export function GET(request: NextRequest) {
  // Keep the Location relative. Behind the production reverse proxy, Next's internal
  // request origin can be localhost even though the browser is on lingerhomes.com.
  // A relative redirect is resolved by the browser against the public origin and can
  // therefore never leak the proxy's internal hostname or port.
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: hostPanelDestination() },
  });
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim();
  response.cookies.set(HOST_PANEL_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: forwardedProtocol === "https" || request.nextUrl.protocol === "https:",
  });
  return response;
}

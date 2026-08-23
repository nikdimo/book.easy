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
  const response = NextResponse.redirect(
    new URL(hostPanelDestination(), request.nextUrl),
  );
  response.cookies.set(HOST_PANEL_COOKIE, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}

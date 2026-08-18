import { NextResponse, type NextRequest } from "next/server";
import {
  HOST_PANEL_COOKIE,
  hostPanelDestination,
  parseHostPanelVersion,
} from "@/lib/host/host-panel-preference";

export function GET(request: NextRequest) {
  const version = parseHostPanelVersion(
    request.nextUrl.searchParams.get("version"),
  );
  if (!version) {
    return NextResponse.json({ error: "Unknown host panel version" }, { status: 400 });
  }

  const response = NextResponse.redirect(
    new URL(hostPanelDestination(version), request.nextUrl),
  );
  response.cookies.set(HOST_PANEL_COOKIE, version, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}

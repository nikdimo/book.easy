import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  HOST_START_COOKIE_OPTIONS,
  HOST_START_DRAFT_COOKIE,
} from "@/lib/host-start-draft";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || (!session.user.isHost && session.user.role !== "ADMIN")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const response = NextResponse.redirect(new URL("/host/start/property-type", request.url));
  response.cookies.set(HOST_START_DRAFT_COOKIE, "", {
    ...HOST_START_COOKIE_OPTIONS,
    maxAge: 0,
  });
  return response;
}

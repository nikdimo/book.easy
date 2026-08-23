import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  HOST_START_COOKIE_OPTIONS,
  HOST_START_DRAFT_COOKIE,
  hostStartResumeHref,
} from "@/lib/host-start-draft";
import { listingDraftData } from "@/lib/mobile-listing-draft";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || (!session.user.isHost && session.user.role !== "ADMIN")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const draftId = new URL(request.url).searchParams.get("draft");
  const draft = draftId
    ? await db.listingDraft.findFirst({ where: { id: draftId, hostId: session.user.id } })
    : null;
  if (!draft) return NextResponse.redirect(new URL("/host/listings", request.url));

  const response = NextResponse.redirect(
    new URL(hostStartResumeHref(listingDraftData(draft.data)), request.url),
  );
  response.cookies.set(HOST_START_DRAFT_COOKIE, draft.id, HOST_START_COOKIE_OPTIONS);
  return response;
}

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  HOST_START_COOKIE_OPTIONS,
  HOST_START_DRAFT_COOKIE,
  hostStartResumeHref,
} from "@/lib/host-start-draft";
import { relativeRedirect } from "@/lib/http/relative-redirect";
import { listingDraftData } from "@/lib/mobile-listing-draft";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || (!session.user.isHost && session.user.role !== "ADMIN")) {
    return relativeRedirect("/login");
  }
  const draftId = new URL(request.url).searchParams.get("draft");
  const draft = draftId
    ? await db.listingDraft.findFirst({ where: { id: draftId, hostId: session.user.id } })
    : null;
  if (!draft) return relativeRedirect("/host/listings");

  const response = relativeRedirect(hostStartResumeHref(listingDraftData(draft.data)));
  response.cookies.set(HOST_START_DRAFT_COOKIE, draft.id, HOST_START_COOKIE_OPTIONS);
  return response;
}

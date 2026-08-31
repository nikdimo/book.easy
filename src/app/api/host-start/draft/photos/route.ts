import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireHost } from "@/lib/auth-helpers";
import {
  HOST_START_COOKIE_OPTIONS,
  HOST_START_DRAFT_COOKIE,
} from "@/lib/host-start-draft";
import { addDraftPhoto, removeDraftPhoto } from "@/lib/host/v2/draft-photo-store";
import { rateLimit } from "@/lib/rate-limit";

/**
 * One photo of a from-scratch listing draft.
 *
 * POST stores the file *and* records it on the draft in a single server-owned operation,
 * so a batch that fails on its fifth photo keeps the four that already worked. DELETE is
 * scoped to a photo that is already on the caller's own draft — it is not a "delete this
 * URL" endpoint, and a URL the caller does not own is simply not found.
 */

/** The same bucket `/api/upload` uses, so routing an upload through here cannot double a
 *  host's allowance. */
function uploadBudget(hostId: string) {
  return rateLimit(`upload:${hostId}`, 100, 10 * 60 * 1000);
}

function unauthorized(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Host access required" },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  let hostId: string;
  try {
    hostId = (await requireHost()).id;
  } catch (error) {
    return unauthorized(error);
  }

  if (!uploadBudget(hostId).success) {
    return NextResponse.json(
      { error: "Too many uploads. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("Unable to parse draft photo upload", error);
    return NextResponse.json(
      { error: "The upload request could not be read. Check the file size and try again." },
      { status: 400 },
    );
  }

  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  const altEntry = formData.get("alt");

  const store = await cookies();
  const result = await addDraftPhoto({
    hostId,
    draftId: store.get(HOST_START_DRAFT_COOKIE)?.value ?? null,
    file: fileEntry,
    alt: typeof altEntry === "string" ? altEntry : undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  store.set(HOST_START_DRAFT_COOKIE, result.draftId, HOST_START_COOKIE_OPTIONS);
  revalidatePath("/host/listings");
  return NextResponse.json({
    success: true,
    draftId: result.draftId,
    url: result.url,
    mediaType: result.mediaType,
    isPanorama: result.isPanorama,
    data: result.data,
  });
}

export async function DELETE(request: Request) {
  let hostId: string;
  try {
    hostId = (await requireHost()).id;
  } catch (error) {
    return unauthorized(error);
  }

  let url: unknown;
  try {
    ({ url } = (await request.json()) as { url?: unknown });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof url !== "string" || url.length === 0 || url.length > 2000) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const store = await cookies();
  const result = await removeDraftPhoto({
    hostId,
    draftId: store.get(HOST_START_DRAFT_COOKIE)?.value ?? null,
    url,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  revalidatePath("/host/listings");
  return NextResponse.json({ success: true, draftId: result.draftId, data: result.data });
}

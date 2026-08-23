import { db } from "@/lib/db";
import { deleteOwnedListingDraftWithCleanup } from "@/lib/listing-draft-cleanup";
import {
  listingDraftData,
  mergeMobileListingDraft,
  parseMobileListingDraftPatch,
} from "@/lib/mobile-listing-draft";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;
  const { id } = await context.params;
  const draft = await db.listingDraft.findFirst({
    where: { id, hostId: access.user.id },
  });
  if (!draft) {
    return mobileJson(request, { error: "Draft not found" }, { status: 404 });
  }
  return mobileJson(request, {
    draftId: draft.id,
    data: listingDraftData(draft.data),
    updatedAt: draft.updatedAt.toISOString(),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;
  const { id } = await context.params;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseMobileListingDraftPatch(input);
  if ("error" in parsed) {
    return mobileJson(request, parsed, { status: 400 });
  }

  const existing = await db.listingDraft.findFirst({
    where: { id, hostId: access.user.id },
    select: { id: true, data: true },
  });
  if (!existing) {
    return mobileJson(request, { error: "Draft not found" }, { status: 404 });
  }

  const draft = await db.listingDraft.update({
    where: { id },
    data: { data: mergeMobileListingDraft(existing.data, parsed.data) },
  });
  return mobileJson(request, {
    draftId: draft.id,
    data: listingDraftData(draft.data),
    updatedAt: draft.updatedAt.toISOString(),
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;
  const { id } = await context.params;
  // The same operation the web paths use: still scoped to this host's own draft, and now
  // the photos it was holding go with it instead of staying on disk unreferenced.
  const result = await deleteOwnedListingDraftWithCleanup({
    hostId: access.user.id,
    draftId: id,
  });
  if (!result.ok) {
    return mobileJson(request, { error: result.error }, { status: result.status });
  }
  return mobileJson(request, { success: true });
}

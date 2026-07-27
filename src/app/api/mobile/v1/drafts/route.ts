import { db } from "@/lib/db";
import {
  mergeMobileListingDraft,
  parseMobileListingDraftPatch,
} from "@/lib/mobile-listing-draft";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function POST(request: Request) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;

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

  const draft = await db.listingDraft.create({
    data: {
      hostId: access.user.id,
      data: mergeMobileListingDraft(null, parsed.data),
    },
  });

  return mobileJson(
    request,
    { draftId: draft.id, data: draft.data, updatedAt: draft.updatedAt.toISOString() },
    { status: 201 }
  );
}

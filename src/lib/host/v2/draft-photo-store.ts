import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { listingDraftData } from "@/lib/mobile-listing-draft";
import { storeUploadedFile } from "@/lib/storage/store-upload";
import { enqueueUploadDeletions, sweepUploads } from "@/lib/storage/upload-cleanup";
import { isUploadStillReferenced } from "@/lib/storage/upload-references";
import type { ListingDraftData } from "@/lib/types/listing-draft";
import type { ListingMediaItem } from "@/lib/types/listing-media";

/**
 * Server-owned photo storage for a from-scratch listing draft.
 *
 * The Photos step used to upload every file to `/api/upload` and only then write the
 * whole list onto the draft. A failure halfway through a batch left the earlier files in
 * storage with nothing in the database pointing at them, and the host's retry uploaded
 * them all over again. Each file now goes up and lands on the draft in the same
 * operation, so the work already done survives the failure and the retry only carries
 * what is still missing.
 *
 * Every function here re-proves ownership from `hostId` — a draft id alone is never
 * enough — and every deletion asks the database whether the file is still referenced
 * before it touches the disk.
 */

/** The cap the draft's own schema enforces (`mobileListingDraftPatchSchema`). Checked
 *  here too, because these writes go straight to the draft row rather than through that
 *  patch parser. */
const MAX_DRAFT_MEDIA = 50;
const MAX_DRAFT_WRITE_ATTEMPTS = 5;

export type DraftPhotoResult<T> = ({ ok: true } & T) | { ok: false; status: number; error: string };

async function ownedDraft(hostId: string, draftId: string | null) {
  if (!draftId) return null;
  return db.listingDraft.findFirst({ where: { id: draftId, hostId } });
}

function mediaItems(data: ListingDraftData): ListingMediaItem[] {
  return Array.isArray(data.mediaItems) ? data.mediaItems : [];
}

class DraftMediaLimitError extends Error {}

async function appendToOwnedDraft(
  draftId: string,
  hostId: string,
  item: ListingMediaItem,
): Promise<ListingDraftData> {
  for (let attempt = 0; attempt < MAX_DRAFT_WRITE_ATTEMPTS; attempt += 1) {
    const current = await ownedDraft(hostId, draftId);
    if (!current) throw new Error("Listing draft not found");
    const existing = listingDraftData(current.data);
    if (mediaItems(existing).length >= MAX_DRAFT_MEDIA) throw new DraftMediaLimitError();
    const next: ListingDraftData = {
      ...existing,
      mediaItems: [...mediaItems(existing), item],
    };
    // Compare-and-swap prevents two uploads that finish together from overwriting each
    // other. A loser rereads the newer list and appends to that instead.
    const updated = await db.listingDraft.updateMany({
      where: { id: draftId, hostId, updatedAt: current.updatedAt },
      data: { data: next as unknown as Prisma.InputJsonValue },
    });
    if (updated.count === 1) return next;
  }
  throw new Error("Listing draft changed too many times");
}

async function queueFailedUpload(url: string) {
  try {
    const queued = await enqueueUploadDeletions(db, [url], "draft-photo-save-failed");
    await sweepUploads(queued, "draft-photo-save-failed");
  } catch (error) {
    console.error(`Unable to queue failed draft upload ${url}`, error);
  }
}

/** Re-exported from the storage layer, where every deletion path now asks the same
 *  question. Kept on this module because its callers have always imported it here. */
export { isUploadStillReferenced };

/**
 * Stores one picked file and records it on the host's own draft.
 *
 * If the draft write fails the file is unlinked again before returning: it was created
 * inside this request, nothing else can be pointing at it yet, and leaving it behind is
 * exactly the orphan this whole module exists to avoid.
 */
export async function addDraftPhoto({
  hostId,
  draftId,
  file,
  alt,
}: {
  hostId: string;
  draftId: string | null;
  file: File;
  alt?: string;
}): Promise<DraftPhotoResult<{ draftId: string; url: string; mediaType: "IMAGE" | "VIDEO"; data: ListingDraftData }>> {
  const draft = await ownedDraft(hostId, draftId);
  const existing = draft ? listingDraftData(draft.data) : {};
  if (mediaItems(existing).length >= MAX_DRAFT_MEDIA) {
    return { ok: false, status: 400, error: `A listing can hold ${MAX_DRAFT_MEDIA} photos at most.` };
  }

  const stored = await storeUploadedFile(file);
  if (!stored.ok) return { ok: false, status: stored.status, error: stored.error };

  const item: ListingMediaItem = {
    url: stored.url,
    mediaType: stored.mediaType,
    alt: alt?.slice(0, 500) || null,
  };

  try {
    if (draft) {
      const data = await appendToOwnedDraft(draft.id, hostId, item);
      return { ok: true, draftId: draft.id, url: stored.url, mediaType: stored.mediaType, data };
    }
    // A stale or foreign cookie never grants access and never blocks a host from
    // starting over — it is replaced with a new, owned draft, matching
    // `saveHostStartDraftPatch`.
    const next: ListingDraftData = { ...existing, mediaItems: [item] };
    const created = await db.listingDraft.create({
      data: { hostId, data: next as unknown as Prisma.InputJsonValue },
    });
    return {
      ok: true,
      draftId: created.id,
      url: stored.url,
      mediaType: stored.mediaType,
      data: listingDraftData(created.data),
    };
  } catch (error) {
    console.error("Unable to record draft photo", error);
    // Queue before unlinking so a locked file remains discoverable and retryable.
    await queueFailedUpload(stored.url);
    return {
      ok: false,
      status: error instanceof DraftMediaLimitError ? 400 : 500,
      error: error instanceof DraftMediaLimitError
        ? `A listing can hold ${MAX_DRAFT_MEDIA} photos at most.`
        : "That photo could not be saved to your listing. Please try again.",
    };
  }
}

/**
 * Takes one photo off the host's own draft and, when nothing else wants it, off the disk.
 *
 * The URL is never trusted as an instruction to delete: it has to already be on a draft
 * this host owns, it has to be a URL this app's storage produced, and it has to survive
 * the reference sweep. A URL that fails the second test — a host-pasted external image,
 * say — is only ever unlinked from the draft, never from any disk.
 */
export async function removeDraftPhoto({
  hostId,
  draftId,
  url,
}: {
  hostId: string;
  draftId: string | null;
  url: string;
}): Promise<DraftPhotoResult<{ draftId: string; data: ListingDraftData; fileDeleted: boolean }>> {
  if (!draftId) {
    return { ok: false, status: 404, error: "Your listing draft could not be found." };
  }

  try {
    for (let attempt = 0; attempt < MAX_DRAFT_WRITE_ATTEMPTS; attempt += 1) {
      const draft = await ownedDraft(hostId, draftId);
      if (!draft) {
        return { ok: false, status: 404, error: "Your listing draft could not be found." };
      }
      const existing = listingDraftData(draft.data);
      const items = mediaItems(existing);
      // Safe retry after a response was lost: the caller owns this draft and the desired
      // state has already been reached.
      if (!items.some((item) => item.url === url)) {
        return { ok: true, draftId: draft.id, data: existing, fileDeleted: false };
      }
      const next: ListingDraftData = {
        ...existing,
        mediaItems: items.filter((item) => item.url !== url),
        ...(existing.imageUrls
          ? { imageUrls: existing.imageUrls.filter((value) => value !== url) }
          : {}),
      };

      // The compare-and-swap preserves a photo or another field changed concurrently.
      // The rewrite and cleanup intent still commit together.
      const queued = await db.$transaction(async (tx) => {
        const updated = await tx.listingDraft.updateMany({
          where: { id: draft.id, hostId, updatedAt: draft.updatedAt },
          data: { data: next as unknown as Prisma.InputJsonValue },
        });
        if (updated.count === 0) return null;
        return enqueueUploadDeletions(tx, [url], "draft-photo");
      });
      if (queued === null) continue;

      const cleanup = await sweepUploads(queued, `draft-photo:${draft.id}`);
      return { ok: true, draftId: draft.id, data: next, fileDeleted: cleanup.deleted > 0 };
    }
  } catch (error) {
    console.error(`Unable to remove draft photo from ${draftId}`, error);
  }

  return { ok: false, status: 500, error: "That photo could not be removed. Please try again." };
}

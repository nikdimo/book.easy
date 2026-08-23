import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { HOST_START_DRAFT_COOKIE } from "@/lib/host-start-draft";
import { listingDraftData } from "@/lib/mobile-listing-draft";
import {
  enqueueUploadDeletions,
  sweepUploads,
  type UploadCleanupReport,
} from "@/lib/storage/upload-cleanup";
import { draftUploadUrls } from "@/lib/storage/upload-references";

export { draftUploadUrls };

/**
 * The one way a listing draft is thrown away.
 *
 * Removing a single photo from a draft already takes its stored file with it, but
 * discarding the whole draft used to delete the row and leave every photo on disk with
 * nothing left pointing at them. Every delete path — the Host V2 list control, the
 * wizard's Abandon, the mobile API, the publish that consumes the draft, and the cascade
 * behind account deletion — now goes through this module instead.
 *
 * The order matters and is not negotiable: prove ownership, read the URLs off the row,
 * then delete the row and queue its files **in one transaction**, and only afterwards
 * touch the disk. Deleting files first would destroy a host's photos on a draft that
 * turned out not to be theirs, or that the database refused to delete; queuing outside
 * the transaction would let a crash lose the files entirely.
 */

/** What deletion the queued files came from. Diagnostics only — never shown to a user. */
const DRAFT_CLEANUP_REASON = "listing-draft";

/** Drops the wizard's selector when it names the draft that just went away, so the next
 *  visit starts a new listing instead of resuming one that no longer exists. */
async function forgetHostStartCookie(draftId: string) {
  try {
    const store = await cookies();
    if (store.get(HOST_START_DRAFT_COOKIE)?.value === draftId) {
      store.delete(HOST_START_DRAFT_COOKIE);
    }
  } catch {
    // Nothing here can be worth failing a completed deletion over — a context without a
    // mutable cookie store (a token-authenticated mobile call) simply has no selector to
    // clear.
  }
}

export type DeleteDraftResult =
  | { ok: true; draftId: string; cleanup: UploadCleanupReport }
  | { ok: false; status: number; error: string };

/**
 * Deletes one draft the caller owns and cleans up the uploads it leaves behind.
 *
 * `hostId` is the identity the caller has already authenticated; ownership is proven here
 * from it, on the read *and* on the delete, so a draft id alone never grants anything.
 * The result never reports a cleanup problem as a failure — once the row is gone the
 * deletion has happened, and saying otherwise would invite a retry that can only 404.
 */
export async function deleteOwnedListingDraftWithCleanup({
  hostId,
  draftId,
}: {
  hostId: string;
  draftId: string;
}): Promise<DeleteDraftResult> {
  let queued: string[];
  try {
    queued = await db.$transaction(async (tx) => {
      // Read and delete in the same serializable transaction. Otherwise an upload can be
      // appended after the URLs are read but before the row is deleted, stranding that
      // newly uploaded file without a cleanup job.
      const draft = await tx.listingDraft.findFirst({
        where: { id: draftId, hostId },
        select: { id: true, data: true, updatedAt: true },
      });
      if (!draft) throw new DraftAlreadyGone();
      const urls = draftUploadUrls(listingDraftData(draft.data));
      const { count } = await tx.listingDraft.deleteMany({
        where: { id: draftId, hostId, updatedAt: draft.updatedAt },
      });
      if (count === 0) throw new DraftAlreadyGone();
      // Inside the transaction on purpose: either the draft goes and its files are on
      // record as needing removal, or neither happened.
      return enqueueUploadDeletions(tx, urls, DRAFT_CLEANUP_REASON);
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof DraftAlreadyGone) {
      return { ok: false, status: 404, error: "Draft not found" };
    }
    console.error(`Unable to delete listing draft ${draftId} (host ${hostId})`, error);
    // Nothing is queued and nothing is unlinked when the row survives — the draft still
    // points at every one of these files.
    return { ok: false, status: 500, error: "That draft could not be deleted. Please try again." };
  }

  await forgetHostStartCookie(draftId);
  const cleanup = await sweepUploads(queued, `${DRAFT_CLEANUP_REASON}:${draftId}`);
  return { ok: true, draftId, cleanup };
}

/** Signals a lost race from inside the transaction, so the rollback happens rather than a
 *  half-done delete being reported as a success. */
class DraftAlreadyGone extends Error {
  constructor() {
    super("Draft already gone");
    this.name = "DraftAlreadyGone";
  }
}

/**
 * Queues the uploads of every draft a user owns, from inside the transaction that is
 * about to delete that user.
 *
 * `ListingDraft.host` is `onDelete: Cascade`, so deleting an account takes its drafts with
 * it without any of the delete paths above ever running. Reading the drafts and queueing
 * their files in the same transaction is what stops those photos from being stranded —
 * and because it is the same transaction, a user deletion that rolls back queues nothing.
 *
 * Returns the queued URLs so the caller can sweep them after the commit. Nothing is
 * deleted here: the reference sweep still runs per file afterwards, so a photo that is
 * also on a published listing, another host's draft, an avatar or a case attachment
 * survives.
 */
export async function enqueueUserDraftUploads(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  userId: string,
): Promise<string[]> {
  const drafts = await tx.listingDraft.findMany({
    where: { hostId: userId },
    select: { data: true },
  });
  const urls = [
    ...new Set(drafts.flatMap((draft) => draftUploadUrls(listingDraftData(draft.data)))),
  ];
  return enqueueUploadDeletions(tx, urls, "account-deletion");
}

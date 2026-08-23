import "server-only";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { getUploadDir } from "@/lib/storage/local.adapter";
import { deleteStoredFile, isManagedUploadUrl } from "@/lib/storage/store-upload";
import { isUploadStillReferenced } from "@/lib/storage/upload-references";

/**
 * Finds — and optionally removes — uploads that nothing in the database points at.
 *
 * This is the sweep for files orphaned *before* the cleanup outbox existed, and for
 * anything an operator has reason to suspect got stranded since. It works from the disk
 * inwards, which is the opposite direction to every other cleanup path in the app and the
 * reason it is deliberately awkward to fire: dry-run is the default, and deleting requires
 * an explicit `apply`.
 *
 * Local-storage only. It reads the directory `LocalStorageAdapter` writes to; a remote
 * adapter would need its own listing implementation, and the reconciler refuses rather
 * than guessing.
 */

/**
 * How recently a file may have been written and still be left alone.
 *
 * This is not politeness, it is correctness. `/api/upload` stores a file and hands its URL
 * to the browser, which attaches it to a listing or a draft in a *later* request — for the
 * whole of that window the file is on disk with nothing referencing it, and is
 * indistinguishable from an orphan. Anything younger than this is skipped.
 */
export const DEFAULT_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** Reference checks are database round trips; a few at a time keeps a reconcile from
 *  monopolising the connection pool on a live server. */
const DEFAULT_CONCURRENCY = 4;

export interface ReconcileReport {
  /** Files found in the upload directory. */
  scanned: number;
  /** Skipped: a name the app's own storage would never have produced. */
  unsafe: number;
  /** Skipped: written too recently to tell apart from an upload still in flight. */
  tooRecent: number;
  /** Something in the database still points at these. */
  referenced: number;
  /** Unreferenced and old enough — the deletion candidates. */
  orphaned: number;
  /** Actually unlinked (always 0 unless `apply`). */
  deleted: number;
  /** Candidates left in place because this was a dry run. */
  kept: number;
  /** Candidates whose deletion was attempted and failed. */
  failed: number;
  /** The orphan URLs, so a dry run can be read before anything is done. */
  candidates: string[];
}

export interface ReconcileOptions {
  /** Deletes. Omitted or false means report only — the default, on purpose. */
  apply?: boolean;
  minAgeMs?: number;
  concurrency?: number;
  /** Caps how many files are inspected in one run. */
  limit?: number;
  /** Overrides the directory to scan. Tests pass a temporary one; nothing in the app does. */
  uploadDir?: string;
  now?: number;
}

export async function reconcileUploads({
  apply = false,
  minAgeMs = DEFAULT_MIN_AGE_MS,
  concurrency = DEFAULT_CONCURRENCY,
  limit = Number.POSITIVE_INFINITY,
  uploadDir = getUploadDir(),
  now = Date.now(),
}: ReconcileOptions = {}): Promise<ReconcileReport> {
  const report: ReconcileReport = {
    scanned: 0,
    unsafe: 0,
    tooRecent: 0,
    referenced: 0,
    orphaned: 0,
    deleted: 0,
    kept: 0,
    failed: 0,
    candidates: [],
  };

  let entries: string[];
  try {
    entries = await readdir(uploadDir);
  } catch (error) {
    // A missing directory means nothing has ever been uploaded here — an empty report,
    // not a failure.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return report;
    throw error;
  }

  const names = entries.slice(0, Math.max(0, limit));

  const inspect = async (name: string) => {
    const url = `/uploads/${name}`;
    // The same gate every other deletion path uses. A name this rejects is not something
    // this app wrote, so it is not something this app may remove.
    if (!isManagedUploadUrl(url)) {
      report.unsafe += 1;
      return;
    }

    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(join(uploadDir, name));
    } catch {
      // Vanished or unreadable between the listing and now — nothing to reconcile.
      report.unsafe += 1;
      return;
    }
    if (!info.isFile()) {
      report.unsafe += 1;
      return;
    }
    report.scanned += 1;

    if (now - info.mtimeMs < minAgeMs) {
      report.tooRecent += 1;
      return;
    }

    if (await isUploadStillReferenced(url)) {
      report.referenced += 1;
      return;
    }

    report.orphaned += 1;
    report.candidates.push(url);
    if (!apply) {
      report.kept += 1;
      return;
    }
    if (await deleteStoredFile(url)) report.deleted += 1;
    else report.failed += 1;
  };

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, names.length) }, async () => {
      while (next < names.length) {
        const name = names[next];
        next += 1;
        await inspect(name);
      }
    }),
  );

  report.candidates.sort();
  return report;
}

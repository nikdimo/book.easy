import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { deleteStoredFile, isManagedUploadUrl } from "@/lib/storage/store-upload";
import { isUploadStillReferenced } from "@/lib/storage/upload-references";

/**
 * The outbox that makes upload cleanup crash-safe.
 *
 * A file on disk and a row in the database cannot be changed atomically, so the gap
 * between "the draft is deleted" and "its photos are unlinked" always exists. What this
 * module removes is the possibility of *losing track* of that gap: the intent to delete a
 * file is written in the same transaction as the deletion that orphaned it, so a process
 * killed one instruction later still finds the job waiting on the next sweep.
 *
 * Nothing here decides what may be deleted on its own — `isManagedUploadUrl` gates what
 * can be queued, and the reference sweep is re-run at processing time rather than trusted
 * from whenever the job was written.
 */

/** Enough of the client to run inside a caller's transaction. */
type UploadCleanupClient = Pick<PrismaClient, "pendingUploadDeletion">;

/** How many queued files are inspected at once. Each one asks six tables whether it is
 *  still wanted; firing a whole backlog at once would queue the connection pool behind
 *  the sweep. */
const PROCESS_CONCURRENCY = 4;

/** Default ceiling for one sweep, so a manual run or a nightly job is always bounded. */
export const DEFAULT_CLEANUP_BATCH = 200;

/** Truncated before storing: an adapter's error text is diagnostic, not a payload. */
const MAX_ERROR_LENGTH = 500;

export interface UploadCleanupReport {
  /** Queue rows looked at. */
  scanned: number;
  /** Files unlinked, and their job removed. */
  deleted: number;
  /** Files something else still references — job removed, file left alone. */
  kept: number;
  /** Files whose removal failed. The job stays queued for the next sweep. */
  failed: number;
}

/**
 * Records files as needing deletion. Safe to call inside a transaction, and meant to be:
 * that is the whole point of the queue.
 *
 * Only server-generated `/uploads/` paths are accepted. A remote imported photo is
 * somebody else's CDN object and a hand-written value could be a traversal; neither is a
 * file this app may unlink, so neither is allowed into the queue in the first place.
 * Returns the URLs that were actually queued.
 */
export async function enqueueUploadDeletions(
  client: UploadCleanupClient,
  urls: readonly string[],
  reason: string,
): Promise<string[]> {
  const managed = [...new Set(urls)].filter(isManagedUploadUrl);
  for (const url of managed) {
    // Upsert rather than create: the same file queued twice is one job, which is what
    // makes both enqueueing and processing idempotent.
    await client.pendingUploadDeletion.upsert({
      where: { url },
      create: { url, reason },
      update: { reason },
    });
  }
  return managed;
}

/**
 * Works through queued deletions, oldest first.
 *
 * Idempotent by construction: a job whose file is already gone still succeeds (the
 * adapter treats a missing file as done), and its row is removed either way. A job whose
 * file turns out to be referenced after all is dropped from the queue without touching
 * the disk — re-running can only ever converge.
 *
 * Never throws. It is called from request paths that have already committed their
 * database work, and failing them afterwards would report a completed deletion as
 * unsuccessful.
 */
export async function processPendingUploadDeletions({
  limit = DEFAULT_CLEANUP_BATCH,
  urls,
}: {
  limit?: number;
  /** Restricts the sweep to specific files — used by the request that just queued them,
   *  so the common case is cleaned up immediately rather than waiting for a job. */
  urls?: readonly string[];
} = {}): Promise<UploadCleanupReport> {
  const report: UploadCleanupReport = { scanned: 0, deleted: 0, kept: 0, failed: 0 };

  let jobs: { id: string; url: string }[];
  try {
    jobs = await db.pendingUploadDeletion.findMany({
      where: urls ? { url: { in: [...new Set(urls)] } } : undefined,
      orderBy: { createdAt: "asc" },
      take: Math.max(0, limit),
      select: { id: true, url: true },
    });
  } catch (error) {
    console.error("Unable to read the upload cleanup queue", error);
    return report;
  }
  report.scanned = jobs.length;

  const settle = async (job: { id: string; url: string }) => {
    // Re-checked here rather than trusted from when the job was written: the file may
    // have been attached to something else in between, and the queue is not a licence.
    if (!isManagedUploadUrl(job.url) || (await isUploadStillReferenced(job.url))) {
      await db.pendingUploadDeletion.deleteMany({ where: { id: job.id } });
      report.kept += 1;
      return;
    }
    if (await deleteStoredFile(job.url)) {
      await db.pendingUploadDeletion.deleteMany({ where: { id: job.id } });
      report.deleted += 1;
      return;
    }
    throw new Error("The storage adapter could not remove the file");
  };

  let next = 0;
  const workers = Array.from(
    { length: Math.min(PROCESS_CONCURRENCY, jobs.length) },
    async () => {
      while (next < jobs.length) {
        const job = jobs[next];
        next += 1;
        try {
          await settle(job);
        } catch (error) {
          report.failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Upload cleanup job ${job.id} failed`, error);
          try {
            // Kept queued — a failure has to stay discoverable and retryable, and the
            // counter is what makes a permanently stuck file visible.
            await db.pendingUploadDeletion.update({
              where: { id: job.id },
              data: {
                attempts: { increment: 1 },
                lastError: message.slice(0, MAX_ERROR_LENGTH),
                lastTriedAt: new Date(),
              },
            });
          } catch (bookkeeping) {
            console.error(`Could not record the failure of cleanup job ${job.id}`, bookkeeping);
          }
        }
      }
    },
  );
  await Promise.allSettled(workers);

  if (report.failed > 0) {
    console.error(
      `Upload cleanup left ${report.failed} job(s) queued for retry (scanned ${report.scanned})`,
    );
  }
  return report;
}

/**
 * Queues a set of files and immediately tries to clear them.
 *
 * The convenience wrapper every deletion path uses after its transaction commits: the
 * queue is the durable record, and this is the happy path that usually empties it within
 * the same request. Never throws — by the time it runs, the database is already in its
 * final state.
 */
export async function sweepUploads(
  urls: readonly string[],
  reason: string,
): Promise<UploadCleanupReport> {
  const managed = [...new Set(urls)].filter(isManagedUploadUrl);
  if (managed.length === 0) return { scanned: 0, deleted: 0, kept: 0, failed: 0 };
  try {
    return await processPendingUploadDeletions({ urls: managed, limit: managed.length });
  } catch (error) {
    console.error(`Upload sweep failed for ${reason}`, error);
    return { scanned: 0, deleted: 0, kept: 0, failed: managed.length };
  }
}

/** What is still waiting, for an operator deciding whether to investigate. Counts only —
 *  storage paths are never handed to a client. */
export async function pendingUploadDeletionStats(): Promise<{
  queued: number;
  failing: number;
  oldestQueuedAt: string | null;
}> {
  const [queued, failing, oldest] = await Promise.all([
    db.pendingUploadDeletion.count(),
    db.pendingUploadDeletion.count({ where: { attempts: { gt: 0 } } }),
    db.pendingUploadDeletion.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);
  return { queued, failing, oldestQueuedAt: oldest?.createdAt.toISOString() ?? null };
}

/** Re-exported so a caller inside a transaction can type its client without reaching for
 *  Prisma's namespace directly. */
export type UploadCleanupTransaction = Prisma.TransactionClient;

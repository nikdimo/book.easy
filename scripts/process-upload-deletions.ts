/**
 * Retries queued managed-upload deletions.
 *
 * Every deletion that orphans an uploaded file records it in `PendingUploadDeletion` in
 * the same transaction as the row it belonged to, so a crash between the commit and the
 * unlink loses the file's removal but never the knowledge that it is due. This drains
 * that queue.
 *
 * Idempotent and bounded — safe to run as often as you like, and already wired into the
 * nightly retention job (`npm run gdpr:cleanup`) for the unattended case.
 *
 * Usage:
 *   npm run uploads:process-deletions
 *   npm run uploads:process-deletions -- --limit 1000
 */

import {
  DEFAULT_CLEANUP_BATCH,
  pendingUploadDeletionStats,
  processPendingUploadDeletions,
} from "@/lib/storage/upload-cleanup";

function numberFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

async function main() {
  const limit = numberFlag("limit", DEFAULT_CLEANUP_BATCH);
  const before = await pendingUploadDeletionStats();
  console.log(`🧹 Upload cleanup queue: ${before.queued} waiting (${before.failing} previously failed)`);
  if (before.oldestQueuedAt) console.log(`   oldest queued at ${before.oldestQueuedAt}`);

  const report = await processPendingUploadDeletions({ limit });
  console.log(
    `   scanned ${report.scanned} · deleted ${report.deleted} · kept (still referenced) ${report.kept} · failed ${report.failed}`,
  );

  const after = await pendingUploadDeletionStats();
  console.log(`   ${after.queued} still queued`);
  if (report.failed > 0) {
    console.log("⚠️  Some jobs failed and stay queued for the next run — see the server log for details.");
  } else {
    console.log("✅ Done");
  }
}

main()
  .catch((error) => {
    console.error("❌ Upload cleanup failed:", error);
    process.exit(1);
  })
  .finally(() => process.exit(0));

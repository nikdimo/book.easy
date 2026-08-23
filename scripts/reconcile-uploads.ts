/**
 * Finds uploads that nothing in the database references, and optionally removes them.
 *
 * This is the sweep for files orphaned *before* the cleanup outbox existed. Everything
 * since is queued transactionally and drained by `npm run uploads:process-deletions`; this
 * command exists for the historical backlog and for spot checks.
 *
 * It reports by default and deletes nothing. Read the candidate list first, then re-run
 * with `--apply` if you agree with it.
 *
 * Usage:
 *   npm run uploads:reconcile                        # dry run, prints candidates
 *   npm run uploads:reconcile -- --limit 500         # inspect at most 500 files
 *   npm run uploads:reconcile -- --min-age-hours 72  # be stricter about in-flight uploads
 *   npm run uploads:reconcile -- --apply             # actually delete
 *
 * A file younger than `--min-age-hours` (24 by default) is always skipped: `/api/upload`
 * stores a file before the request that attaches it to a listing or draft ever runs, and
 * during that window an in-flight upload is indistinguishable from an orphan.
 */

import { getUploadDir } from "@/lib/storage/local.adapter";
import { DEFAULT_MIN_AGE_MS, reconcileUploads } from "@/lib/storage/reconcile-uploads";

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function numberFlag(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const apply = hasFlag("apply");
  const minAgeMs = numberFlag("min-age-hours", DEFAULT_MIN_AGE_MS / 3_600_000) * 3_600_000;
  const limit = numberFlag("limit", Number.POSITIVE_INFINITY);

  console.log(`🔎 Reconciling uploads in ${getUploadDir()}`);
  console.log(
    `   mode: ${apply ? "APPLY (files will be deleted)" : "dry run (nothing will be deleted)"}`,
  );
  console.log(`   ignoring anything modified in the last ${(minAgeMs / 3_600_000).toFixed(1)}h`);

  const report = await reconcileUploads({ apply, minAgeMs, limit });

  console.log("");
  console.log(`   scanned:     ${report.scanned}`);
  console.log(`   unsafe/skip: ${report.unsafe}`);
  console.log(`   too recent:  ${report.tooRecent}`);
  console.log(`   referenced:  ${report.referenced}`);
  console.log(`   orphaned:    ${report.orphaned}`);
  console.log(`   deleted:     ${report.deleted}`);
  console.log(`   kept:        ${report.kept}`);
  console.log(`   failed:      ${report.failed}`);

  if (report.candidates.length > 0) {
    console.log("");
    console.log(apply ? "Orphans processed:" : "Orphan candidates (re-run with --apply to delete):");
    for (const url of report.candidates) console.log(`   ${url}`);
  } else {
    console.log("\n✅ No orphaned uploads found.");
  }
}

main()
  .catch((error) => {
    console.error("❌ Reconcile failed:", error);
    process.exit(1);
  })
  .finally(() => process.exit(0));

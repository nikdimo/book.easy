import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  DEFAULT_CLEANUP_BATCH,
  pendingUploadDeletionStats,
  processPendingUploadDeletions,
} from "@/lib/storage/upload-cleanup";

/**
 * The manual retry for queued upload deletions (admin only).
 *
 * This is not a "delete this file" endpoint and cannot be made into one: it takes no URLs
 * and no ids, and works only through the outbox, whose rows are written by the server in
 * the same transaction as the deletion that orphaned each file. Every job still re-checks
 * ownership-independent references before anything is unlinked, so replaying it is safe
 * and idempotent.
 *
 * `GET` reports what is waiting — counts only. Storage paths and adapter error strings
 * stay in the server log where they belong.
 */

/** A sweep is disk work; a handful of runs a minute is plenty for an operator and stops
 *  an admin session from being used to hammer it. */
function sweepBudget(userId: string) {
  return rateLimit(`admin-upload-cleanup:${userId}`, 10, 60 * 1000);
}

async function requireAdminId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") return null;
  return session.user.id;
}

export async function GET() {
  const adminId = await requireAdminId();
  if (!adminId) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }
  return NextResponse.json(await pendingUploadDeletionStats());
}

export async function POST(request: Request) {
  const adminId = await requireAdminId();
  if (!adminId) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  if (!sweepBudget(adminId).success) {
    return NextResponse.json(
      { error: "Too many cleanup runs. Please wait a moment and try again." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  // Bounded whatever the caller asks for: a sweep walks the filesystem, and an unbounded
  // one is an outage waiting to happen.
  const requested = typeof body.limit === "number" ? Math.floor(body.limit) : DEFAULT_CLEANUP_BATCH;
  const limit = Math.min(Math.max(requested, 1), DEFAULT_CLEANUP_BATCH * 5);

  const report = await processPendingUploadDeletions({ limit });
  console.log(
    `Admin ${adminId} ran upload cleanup: scanned ${report.scanned}, deleted ${report.deleted}, kept ${report.kept}, failed ${report.failed}`,
  );

  return NextResponse.json({
    success: true,
    ...report,
    remaining: await pendingUploadDeletionStats(),
    timestamp: new Date().toISOString(),
  });
}

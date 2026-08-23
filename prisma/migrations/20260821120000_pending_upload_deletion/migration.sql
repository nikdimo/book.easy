-- The outbox behind managed-upload cleanup.
--
-- A file on disk and a row in the database cannot be changed atomically, so every
-- deletion that orphans an upload now records the file here in the same transaction as
-- the row it belonged to. A crash between the commit and the unlink therefore loses the
-- bytes' removal, never the knowledge that they need removing: the sweep
-- (`npm run uploads:process-deletions`, the admin route, or the nightly retention job)
-- retries whatever is still queued.
--
-- `url` is unique so enqueueing is idempotent — the same file queued twice is one row.
CREATE TABLE "PendingUploadDeletion" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastTriedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PendingUploadDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingUploadDeletion_url_key" ON "PendingUploadDeletion"("url");
-- The sweep takes the oldest queued files first, so a job that keeps failing cannot
-- starve the ones behind it forever.
CREATE INDEX "PendingUploadDeletion_createdAt_idx" ON "PendingUploadDeletion"("createdAt");

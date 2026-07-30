ALTER TABLE "Notification" ADD COLUMN "pushLockedAt" TIMESTAMP(3);

-- Notifications created before the retry outbox existed may already have been pushed.
-- Mark them complete so deploying this migration never re-sends historical alerts.
UPDATE "Notification"
SET "pushSentAt" = "createdAt"
WHERE "pushSentAt" IS NULL;

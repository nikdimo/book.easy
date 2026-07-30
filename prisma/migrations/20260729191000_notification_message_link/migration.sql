ALTER TABLE "Notification" ADD COLUMN "messageId" TEXT;

CREATE INDEX "Notification_userId_messageId_idx"
  ON "Notification"("userId", "messageId");

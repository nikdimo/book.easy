CREATE TABLE "MessageEmailDelivery" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "status" "BookingEmailDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageEmailDelivery_messageId_recipientId_key"
  ON "MessageEmailDelivery"("messageId", "recipientId");
CREATE INDEX "MessageEmailDelivery_status_availableAt_idx"
  ON "MessageEmailDelivery"("status", "availableAt");
CREATE INDEX "MessageEmailDelivery_recipientId_status_idx"
  ON "MessageEmailDelivery"("recipientId", "status");

ALTER TABLE "MessageEmailDelivery"
  ADD CONSTRAINT "MessageEmailDelivery_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageEmailDelivery"
  ADD CONSTRAINT "MessageEmailDelivery_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

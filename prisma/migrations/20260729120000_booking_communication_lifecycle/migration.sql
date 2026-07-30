ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

ALTER TABLE "Booking"
ADD COLUMN "reference" TEXT,
ADD COLUMN "responseDueAt" TIMESTAMP(3),
ADD COLUMN "respondedAt" TIMESTAMP(3),
ADD COLUMN "hostReminderSentAt" TIMESTAMP(3);

UPDATE "Booking"
SET
  "reference" = 'LH-' || UPPER(SUBSTRING(MD5("id") FROM 1 FOR 8)),
  "responseDueAt" = "createdAt" + INTERVAL '24 hours',
  "respondedAt" = CASE
    WHEN "status" <> 'PENDING' THEN "updatedAt"
    ELSE NULL
  END;

ALTER TABLE "Booking"
ALTER COLUMN "reference" SET NOT NULL,
ALTER COLUMN "responseDueAt" SET NOT NULL,
ALTER COLUMN "responseDueAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours');

CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");
CREATE INDEX "Booking_status_responseDueAt_idx" ON "Booking"("status", "responseDueAt");

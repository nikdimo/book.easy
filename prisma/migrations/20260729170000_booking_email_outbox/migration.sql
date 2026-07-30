-- Durable, idempotent transactional email delivery for booking lifecycle events.
CREATE TYPE "BookingEmailKind" AS ENUM (
  'GUEST_REQUEST_RECEIVED',
  'HOST_NEW_REQUEST',
  'HOST_REQUEST_REMINDER',
  'GUEST_CONFIRMED',
  'GUEST_REJECTED',
  'GUEST_EXPIRED',
  'GUEST_CANCELLED',
  'HOST_CANCELLED_BY_GUEST'
);

CREATE TYPE "BookingEmailDeliveryStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'SENT',
  'FAILED'
);

CREATE TABLE "BookingEmailDelivery" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "kind" "BookingEmailKind" NOT NULL,
  "status" "BookingEmailDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BookingEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingEmailDelivery_bookingId_kind_key"
  ON "BookingEmailDelivery"("bookingId", "kind");
CREATE INDEX "BookingEmailDelivery_status_availableAt_idx"
  ON "BookingEmailDelivery"("status", "availableAt");
CREATE INDEX "BookingEmailDelivery_bookingId_status_idx"
  ON "BookingEmailDelivery"("bookingId", "status");

ALTER TABLE "BookingEmailDelivery"
  ADD CONSTRAINT "BookingEmailDelivery_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Cancellation policies, typed booking payment requests, private transaction reports,
-- and reminder delivery deduplication.
--
-- Strictly additive. Existing listing/booking terms and legacy payment-instruction
-- columns remain untouched. Existing listings receive no invented cancellation policy.

CREATE TYPE "BookingRefundStatus" AS ENUM (
  'NOT_REQUIRED',
  'AWAITING_REFUND',
  'REFUND_REPORTED',
  'REFUND_CONFIRMED'
);

CREATE TYPE "BookingPaymentRequestType" AS ENUM (
  'ADVANCE_PAYMENT',
  'ACCOMMODATION_BALANCE',
  'DAMAGE_DEPOSIT'
);

CREATE TYPE "BookingPaymentRequestStatus" AS ENUM (
  'DRAFT',
  'SENT',
  'CANCELLED',
  'SETTLED'
);

CREATE TYPE "BookingPaymentTrack" AS ENUM (
  'ADVANCE_PAYMENT',
  'ACCOMMODATION_BALANCE',
  'DAMAGE_DEPOSIT',
  'ACCOMMODATION_REFUND',
  'DAMAGE_DEPOSIT_RETURN',
  'DAMAGE_DEPOSIT_RETENTION'
);

CREATE TYPE "BookingPaymentReminderKind" AS ENUM (
  'DUE_SOON',
  'DUE_DATE',
  'OVERDUE',
  'RETURN_DUE'
);

ALTER TABLE "Listing"
  ADD COLUMN "freeCancellationDaysBeforeCheckIn" INTEGER,
  ADD COLUMN "cancellationPolicyReviewedAt" TIMESTAMP(3);

ALTER TABLE "Booking"
  ADD COLUMN "cancellationPolicySnapshot" JSONB,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "accommodationRefundAmount" DECIMAL(14,3),
  ADD COLUMN "accommodationRefundStatus" "BookingRefundStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "cancellationSettlementSnapshot" JSONB,
  ADD COLUMN "accommodationRefundStatusUpdatedAt" TIMESTAMP(3);

ALTER TABLE "BookingPaymentStatusEvent"
  ADD COLUMN "accommodationRefundStatus" "BookingRefundStatus";

CREATE TABLE "BookingPaymentRequest" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "type" "BookingPaymentRequestType" NOT NULL,
  "amount" DECIMAL(14,3) NOT NULL,
  "currency" TEXT NOT NULL,
  "dueAt" DATE NOT NULL,
  "status" "BookingPaymentRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "method" "ListingPaymentMethod",
  "otherLabel" TEXT,
  "instructionsSnapshot" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingPaymentRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingPaymentPrivateRecord" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "requestId" TEXT,
  "eventId" TEXT NOT NULL,
  "track" "BookingPaymentTrack" NOT NULL,
  "reporterId" TEXT,
  "amount" DECIMAL(14,3) NOT NULL,
  "currency" TEXT NOT NULL,
  "transactionDate" DATE NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "retainedReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingPaymentPrivateRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingPaymentReminderDelivery" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "requestId" TEXT,
  "recipientId" TEXT NOT NULL,
  "obligationKey" TEXT NOT NULL,
  "kind" "BookingPaymentReminderKind" NOT NULL,
  "dueAt" DATE NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingPaymentReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingPaymentRequest_bookingId_type_key"
  ON "BookingPaymentRequest"("bookingId", "type");
CREATE INDEX "BookingPaymentRequest_status_dueAt_idx"
  ON "BookingPaymentRequest"("status", "dueAt");

CREATE UNIQUE INDEX "BookingPaymentPrivateRecord_eventId_key"
  ON "BookingPaymentPrivateRecord"("eventId");
CREATE INDEX "BookingPaymentPrivateRecord_bookingId_track_createdAt_idx"
  ON "BookingPaymentPrivateRecord"("bookingId", "track", "createdAt");
CREATE INDEX "BookingPaymentPrivateRecord_requestId_idx"
  ON "BookingPaymentPrivateRecord"("requestId");
CREATE INDEX "BookingPaymentPrivateRecord_reporterId_idx"
  ON "BookingPaymentPrivateRecord"("reporterId");

CREATE UNIQUE INDEX "BookingPaymentReminderDelivery_obligationKey_kind_recipientId_key"
  ON "BookingPaymentReminderDelivery"("obligationKey", "kind", "recipientId");
CREATE INDEX "BookingPaymentReminderDelivery_bookingId_sentAt_idx"
  ON "BookingPaymentReminderDelivery"("bookingId", "sentAt");
CREATE INDEX "BookingPaymentReminderDelivery_requestId_idx"
  ON "BookingPaymentReminderDelivery"("requestId");

ALTER TABLE "BookingPaymentRequest"
  ADD CONSTRAINT "BookingPaymentRequest_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookingPaymentPrivateRecord"
  ADD CONSTRAINT "BookingPaymentPrivateRecord_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BookingPaymentPrivateRecord_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "BookingPaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BookingPaymentPrivateRecord_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "BookingPaymentStatusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BookingPaymentPrivateRecord_reporterId_fkey"
  FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BookingPaymentReminderDelivery"
  ADD CONSTRAINT "BookingPaymentReminderDelivery_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BookingPaymentReminderDelivery_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "BookingPaymentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BookingPaymentReminderDelivery_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

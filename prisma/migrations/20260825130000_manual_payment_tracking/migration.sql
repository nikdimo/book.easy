-- Manual-payment foundation. Linger Homes never collects, holds, routes, or refunds
-- funds: this stores a host's stated policy and manual status declarations only.

-- CreateEnum
CREATE TYPE "ListingDepositPolicy" AS ENUM ('NONE', 'FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "ListingDepositPurpose" AS ENUM ('ADVANCE_PAYMENT', 'DAMAGE_SECURITY');

-- CreateEnum
CREATE TYPE "ListingDepositDueTiming" AS ENUM (
  'AFTER_ACCEPTANCE',
  'DAYS_BEFORE_CHECK_IN',
  'AT_CHECK_IN'
);

-- CreateEnum
CREATE TYPE "BookingPaymentStatus" AS ENUM (
  'UNTRACKED',
  'NOT_REQUIRED',
  'AWAITING_PAYMENT',
  'PAYMENT_REPORTED',
  'PAYMENT_CONFIRMED'
);

-- CreateEnum
CREATE TYPE "BookingDepositStatus" AS ENUM (
  'UNTRACKED',
  'NOT_REQUIRED',
  'AWAITING_DEPOSIT',
  'DEPOSIT_REPORTED',
  'DEPOSIT_CONFIRMED',
  'RETURN_REPORTED',
  'RETURN_CONFIRMED',
  'RETAINED'
);

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('CHAT', 'PAYMENT_INSTRUCTIONS');

-- AlterTable
-- Defaults keep existing listings meaningful without presenting a migration-created
-- answer as reviewed. NULL below means a host has not supplied that conditional value.
ALTER TABLE "Listing"
  ADD COLUMN "depositPolicy" "ListingDepositPolicy" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "depositPurpose" "ListingDepositPurpose",
  ADD COLUMN "depositValue" DECIMAL(14,3),
  ADD COLUMN "depositCurrency" TEXT,
  ADD COLUMN "depositDueTiming" "ListingDepositDueTiming" NOT NULL DEFAULT 'AFTER_ACCEPTANCE',
  ADD COLUMN "depositDueDaysBeforeCheckIn" INTEGER,
  ADD COLUMN "depositReturnDaysAfterCheckout" INTEGER,
  ADD COLUMN "depositPolicyReviewedAt" TIMESTAMP(3);

-- Existing bookings remain explicitly untracked rather than being presumed paid,
-- unpaid, or subject to a deposit. New bookings receive their frozen snapshot and
-- computed amount in the booking workflow.
ALTER TABLE "Booking"
  ADD COLUMN "depositPolicySnapshot" JSONB,
  ADD COLUMN "depositAmount" DECIMAL(14,3),
  ADD COLUMN "acceptedAt" TIMESTAMP(3),
  ADD COLUMN "paymentStatus" "BookingPaymentStatus" NOT NULL DEFAULT 'UNTRACKED',
  ADD COLUMN "depositStatus" "BookingDepositStatus" NOT NULL DEFAULT 'UNTRACKED',
  ADD COLUMN "paymentStatusUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "depositStatusUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Message"
  ADD COLUMN "kind" "MessageKind" NOT NULL DEFAULT 'CHAT';

-- CreateTable
CREATE TABLE "BookingPaymentStatusEvent" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "actorId" TEXT,
  "paymentStatus" "BookingPaymentStatus" NOT NULL,
  "depositStatus" "BookingDepositStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BookingPaymentStatusEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BookingPaymentStatusEvent"
  ADD CONSTRAINT "BookingPaymentStatusEvent_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPaymentStatusEvent"
  ADD CONSTRAINT "BookingPaymentStatusEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "BookingPaymentStatusEvent_bookingId_createdAt_idx"
  ON "BookingPaymentStatusEvent"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingPaymentStatusEvent_actorId_idx"
  ON "BookingPaymentStatusEvent"("actorId");

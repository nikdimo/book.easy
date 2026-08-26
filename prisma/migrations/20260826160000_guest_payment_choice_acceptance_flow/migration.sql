-- Store the guest's chosen host-supported method and the host's instruction task.
CREATE TYPE "BookingPaymentInstructionsStatus" AS ENUM (
  'NOT_DECIDED',
  'PENDING',
  'SENT',
  'NOT_NEEDED'
);

ALTER TABLE "Booking"
  ADD COLUMN "selectedPaymentMethod" "ListingPaymentMethod",
  ADD COLUMN "paymentInstructionsStatus" "BookingPaymentInstructionsStatus" NOT NULL DEFAULT 'NOT_DECIDED',
  ADD COLUMN "paymentInstructionsSentAt" TIMESTAMP(3),
  ADD COLUMN "paymentInstructionsDueAt" DATE;

CREATE INDEX "Booking_status_paymentInstructionsStatus_idx"
  ON "Booking"("status", "paymentInstructionsStatus");

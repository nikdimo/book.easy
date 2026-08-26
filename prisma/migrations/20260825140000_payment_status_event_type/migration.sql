-- Preserve the exact actor-labelled action. A pair of resulting statuses does not
-- identify which of the two values changed, so it is not sufficient for honest UI.
ALTER TABLE "BookingPaymentStatusEvent"
  ADD COLUMN "eventType" TEXT NOT NULL DEFAULT 'SYSTEM_STATUS';

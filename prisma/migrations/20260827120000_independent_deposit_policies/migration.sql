-- Independent advance-payment and damage-deposit policies.
--
-- The V1 model gave a listing one deposit with a `purpose` discriminator, so a host
-- could ask for an advance payment toward the stay OR a refundable damage deposit, never
-- both. This migration adds a second, independent slot so a host can require neither,
-- either, or both, and so the two amounts and the two manual status tracks can never be
-- conflated.
--
-- Strictly additive. No column is dropped and no historical booking term is rewritten:
--   * `Listing.deposit*` and `Booking.depositAmount` / `Booking.depositStatus` are left
--     in place, frozen. Nothing writes them after this migration.
--   * `Booking.depositPolicySnapshot` is not touched at all. A booking frozen under V1
--     keeps its V1 JSON verbatim and is projected onto the V2 shape at read time, so a
--     guest's agreed terms stay exactly as they agreed them.
-- The backfill below only populates the new columns from what the old ones already said.

-- CreateEnum
CREATE TYPE "ListingDepositAmountType" AS ENUM ('FIXED', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "advancePaymentDueDaysBeforeCheckIn" INTEGER,
ADD COLUMN     "advancePaymentDueTiming" "ListingDepositDueTiming" NOT NULL DEFAULT 'AFTER_ACCEPTANCE',
ADD COLUMN     "advancePaymentEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "advancePaymentType" "ListingDepositAmountType",
ADD COLUMN     "advancePaymentValue" DECIMAL(14,3),
ADD COLUMN     "damageDepositDueDaysBeforeCheckIn" INTEGER,
ADD COLUMN     "damageDepositDueTiming" "ListingDepositDueTiming" NOT NULL DEFAULT 'AFTER_ACCEPTANCE',
ADD COLUMN     "damageDepositEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "damageDepositReturnDaysAfterCheckout" INTEGER,
ADD COLUMN     "damageDepositType" "ListingDepositAmountType",
ADD COLUMN     "damageDepositValue" DECIMAL(14,3),
ADD COLUMN     "depositPoliciesCurrency" TEXT,
ADD COLUMN     "depositPoliciesReviewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "advancePaymentAmount" DECIMAL(14,3),
ADD COLUMN     "advancePaymentStatus" "BookingPaymentStatus" NOT NULL DEFAULT 'UNTRACKED',
ADD COLUMN     "advancePaymentStatusUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "damageDepositAmount" DECIMAL(14,3),
ADD COLUMN     "damageDepositStatus" "BookingDepositStatus" NOT NULL DEFAULT 'UNTRACKED',
ADD COLUMN     "damageDepositStatusUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BookingPaymentStatusEvent" ADD COLUMN     "advancePaymentStatus" "BookingPaymentStatus",
ADD COLUMN     "damageDepositStatus" "BookingDepositStatus";

-- Backfill: carry every host's existing answer onto the new columns.
--
-- The reviewed marker moves first, for every host who answered — including the ones who
-- answered "no deposit". "Answered neither" and "never opened the screen" are different
-- facts and guests are shown which one applies, so a reviewed NONE must not silently
-- become unreviewed.
UPDATE "Listing"
SET "depositPoliciesReviewedAt" = "depositPolicyReviewedAt",
    "depositPoliciesCurrency"   = "depositCurrency"
WHERE "depositPolicyReviewedAt" IS NOT NULL;

-- An old ADVANCE_PAYMENT policy becomes the advance-payment section, unchanged.
UPDATE "Listing"
SET "advancePaymentEnabled"              = TRUE,
    "advancePaymentType"                 = "depositPolicy"::text::"ListingDepositAmountType",
    "advancePaymentValue"                = "depositValue",
    "advancePaymentDueTiming"            = "depositDueTiming",
    "advancePaymentDueDaysBeforeCheckIn" = "depositDueDaysBeforeCheckIn"
WHERE "depositPolicyReviewedAt" IS NOT NULL
  AND "depositPolicy" <> 'NONE'
  AND "depositPurpose" = 'ADVANCE_PAYMENT';

-- An old DAMAGE_SECURITY policy becomes the damage-deposit section, unchanged. Only
-- this side carries a stated return period, which is why V1 kept it on the shared row.
UPDATE "Listing"
SET "damageDepositEnabled"                 = TRUE,
    "damageDepositType"                    = "depositPolicy"::text::"ListingDepositAmountType",
    "damageDepositValue"                   = "depositValue",
    "damageDepositDueTiming"               = "depositDueTiming",
    "damageDepositDueDaysBeforeCheckIn"    = "depositDueDaysBeforeCheckIn",
    "damageDepositReturnDaysAfterCheckout" = "depositReturnDaysAfterCheckout"
WHERE "depositPolicyReviewedAt" IS NOT NULL
  AND "depositPolicy" <> 'NONE'
  AND "depositPurpose" = 'DAMAGE_SECURITY';

-- Backfill: split each booking's single frozen track onto the track its own snapshot
-- names. The snapshot itself is the authority for what was agreed, and it is only read
-- here, never written.
--
-- A V1 advance payment moves onto the advance track. Its status vocabulary changes
-- ("deposit reported" becomes "payment reported") but the fact recorded does not: the
-- guest said they sent it, or the host said they received it. The V1 service could never
-- reach a return or retention state on an advance payment, so no such state can arrive
-- here; anything unexpected falls back to UNTRACKED rather than inventing progress.
UPDATE "Booking"
SET "advancePaymentAmount"          = "depositAmount",
    "advancePaymentStatus"          = CASE "depositStatus"
      WHEN 'AWAITING_DEPOSIT'  THEN 'AWAITING_PAYMENT'::"BookingPaymentStatus"
      WHEN 'DEPOSIT_REPORTED'  THEN 'PAYMENT_REPORTED'::"BookingPaymentStatus"
      WHEN 'DEPOSIT_CONFIRMED' THEN 'PAYMENT_CONFIRMED'::"BookingPaymentStatus"
      WHEN 'NOT_REQUIRED'      THEN 'NOT_REQUIRED'::"BookingPaymentStatus"
      ELSE 'UNTRACKED'::"BookingPaymentStatus"
    END,
    "advancePaymentStatusUpdatedAt" = "depositStatusUpdatedAt",
    -- This booking's host never asked for damage security, so the other track is
    -- settled rather than merely untracked.
    "damageDepositStatus"           = 'NOT_REQUIRED'
WHERE "depositPolicySnapshot"->>'version' = '1'
  AND "depositPolicySnapshot"->>'purpose' = 'ADVANCE_PAYMENT';

-- A V1 damage deposit moves onto the damage track with its status vocabulary intact,
-- including the return and retention states only it could ever reach.
UPDATE "Booking"
SET "damageDepositAmount"          = "depositAmount",
    "damageDepositStatus"          = "depositStatus",
    "damageDepositStatusUpdatedAt" = "depositStatusUpdatedAt",
    "advancePaymentStatus"         = 'NOT_REQUIRED'
WHERE "depositPolicySnapshot"->>'version' = '1'
  AND "depositPolicySnapshot"->>'purpose' = 'DAMAGE_SECURITY';

-- Bookings whose host asked for nothing: both tracks are settled, not untracked. This
-- also covers bookings taken before deposit tracking existed but already marked as
-- requiring nothing.
UPDATE "Booking"
SET "advancePaymentStatus" = 'NOT_REQUIRED',
    "damageDepositStatus"  = 'NOT_REQUIRED'
WHERE "depositStatus" = 'NOT_REQUIRED'
  AND "advancePaymentStatus" = 'UNTRACKED'
  AND "damageDepositStatus" = 'UNTRACKED';

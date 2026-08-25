-- Additive Phase 2 payment-method preferences. This stores only public method names:
-- no account details, payment handles, links, card data, or payment state belong here.

-- CreateEnum
CREATE TYPE "ListingPaymentMethod" AS ENUM (
  'CASH_AT_PROPERTY',
  'BANK_TRANSFER_LOCAL_SEPA',
  'BANK_TRANSFER_INTERNATIONAL',
  'PAYPAL',
  'REVOLUT',
  'WISE',
  'HOST_SECURE_CARD_LINK',
  'OTHER',
  'ARRANGE_DIRECTLY'
);

-- AlterTable
ALTER TABLE "Listing"
  ADD COLUMN "acceptedPaymentMethods" "ListingPaymentMethod"[] NOT NULL DEFAULT ARRAY[]::"ListingPaymentMethod"[],
  ADD COLUMN "paymentMethodOther" TEXT,
  ADD COLUMN "paymentMethodsReviewedAt" TIMESTAMP(3);

-- Existing bookings intentionally stay NULL. New requests receive a V1 snapshot in
-- booking.service from the listing row read inside the creation transaction.
ALTER TABLE "Booking"
  ADD COLUMN "paymentMethodsSnapshot" JSONB;

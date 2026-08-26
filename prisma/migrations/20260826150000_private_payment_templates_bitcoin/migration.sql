-- Bitcoin is a public accepted-method name. Payment coordinates remain private.
ALTER TYPE "ListingPaymentMethod" ADD VALUE 'BITCOIN' BEFORE 'HOST_SECURE_CARD_LINK';

-- Versioned JSON containing host-only reusable instructions by payment method.
-- This column must never be selected into public listing or guest-facing DTOs.
ALTER TABLE "Listing" ADD COLUMN "paymentInstructionTemplates" JSONB;

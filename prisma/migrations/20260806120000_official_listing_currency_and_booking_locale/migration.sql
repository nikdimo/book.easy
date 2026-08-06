-- Preserve currencies with three-decimal minor units (for example KWD and BHD).
ALTER TABLE "PricingRule"
  ALTER COLUMN "baseNightlyRate" TYPE DECIMAL(14,3),
  ALTER COLUMN "cleaningFee" TYPE DECIMAL(14,3);

ALTER TABLE "ListingDatePrice"
  ALTER COLUMN "nightlyRate" TYPE DECIMAL(14,3);

ALTER TABLE "Booking"
  ALTER COLUMN "nightlyRate" TYPE DECIMAL(14,3),
  ALTER COLUMN "cleaningFee" TYPE DECIMAL(14,3),
  ALTER COLUMN "serviceFee" TYPE DECIMAL(14,3),
  ALTER COLUMN "totalPrice" TYPE DECIMAL(14,3),
  ALTER COLUMN "originalTotal" TYPE DECIMAL(14,3),
  ALTER COLUMN "discountAmount" TYPE DECIMAL(14,3),
  ALTER COLUMN "displayTotal" TYPE DECIMAL(14,3),
  ADD COLUMN "guestLocale" TEXT;

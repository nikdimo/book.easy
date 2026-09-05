-- `PricingRule.serviceFeePercent` was a placeholder with no writer or reader. Booking
-- pricing has always persisted `Booking.serviceFee = 0`; treating this column as live
-- would therefore create an undisplayed, unreconciled price feature.
--
-- The guard makes the destructive part fail closed in a deployed database. A value that
-- could carry business meaning is never silently discarded: deployment stops before the
-- ALTER and the operator can investigate it. NULL is equivalent to the unused default.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PricingRule"
    WHERE COALESCE("serviceFeePercent", 0) <> 0
  ) THEN
    RAISE EXCEPTION
      'Cannot drop PricingRule.serviceFeePercent: non-zero values exist';
  END IF;
END
$$;

ALTER TABLE "PricingRule" DROP COLUMN "serviceFeePercent";

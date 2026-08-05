-- Wall-clock house rules ("15:00"), stored as text rather than a time/timestamp type:
-- a check-in time carries no date and no zone, and any temporal type would invite one.
-- Nullable with no default: NULL means the host is flexible, which is also what every
-- listing published before this column existed honestly is — backfilling 15:00/11:00
-- would put words in their mouths. Adding a nullable column takes no table rewrite, so
-- this is safe to apply to a live Listing table.
ALTER TABLE "Listing" ADD COLUMN "checkInTime" TEXT;
ALTER TABLE "Listing" ADD COLUMN "checkOutTime" TEXT;
